import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  assertUnchangedSettingsSections,
  mergeSettings,
  mergeSettingsPatch,
} from '@shared/constants'
import type { PublicUser, SessionInfo, SiteInfo, TotpLoginChallenge, UserSettings } from '@shared/types'
import { api, ApiError } from '../lib/api'
import { setLocale, t } from '../lib/i18n'
import { localDb } from '../lib/db'
import { applyThemeToDom, useUi } from './ui'

interface SessionState {
  status: 'loading' | 'anonymous' | 'authed'
  user: PublicUser | null
  site: SiteInfo | null
  settings: UserSettings
  authError: string | null

  load: () => Promise<void>
  passwordLogin: (username: string, password: string) => Promise<TotpLoginChallenge | null>
  totpLogin: (challengeToken: string, code: string) => Promise<void>
  passwordRegister: (username: string, password: string) => Promise<void>
  refresh: () => Promise<void>
  refreshSettings: () => Promise<void>
  updateProfile: (patch: { name?: string; avatarUrl?: string }) => Promise<PublicUser>
  updateRegistration: (enabled: boolean, password: string) => Promise<void>
  logout: () => Promise<void>
  updateSettings: (patch: DeepPartial<UserSettings>, options?: { silent?: boolean }) => void
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] }
type SessionSetter = (partial: Partial<SessionState>) => void

let saveTimer: number | undefined
let pendingSettingsPatch: DeepPartial<UserSettings> | null = null
let inFlightSettingsPatch: DeepPartial<UserSettings> | null = null
let shouldNotifyPendingSettings = false
let isSettingsSaveInFlight = false
let settingsRetryDelay = 1_500
let settingsEpoch = 0
let settingsSaveToken = 0
let settingsSaveCompletion: Promise<void> = Promise.resolve()
let settingsUserId: string | null = null
let settingsRequestSequence = 0
let sessionRequestSequence = 0
let logoutPromise: Promise<void> | null = null
let registrationMutationSequence = 0
let sessionCacheTask: Promise<void> = Promise.resolve()
let sessionCacheEpoch = 0

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  site: null,
  settings: DEFAULT_SETTINGS,
  authError: null,

  load: () => loadImpl(set),
  passwordLogin: (username, password) => passwordLoginImpl(set, username, password),
  totpLogin: (challengeToken, code) => totpLoginImpl(set, challengeToken, code),
  passwordRegister: (username, password) => passwordRegisterImpl(set, username, password),
  refresh: () => refreshImpl(set),
  refreshSettings: () => refreshSettingsImpl(set, get),
  updateProfile: (patch) => updateProfileImpl(set, get, patch),
  updateRegistration: (enabled, password) => updateRegistrationImpl(set, get, enabled, password),
  logout: () => logoutImpl(set, get),
  updateSettings: (patch, options) => updateSettingsImpl(set, get, patch, options),
}))

async function loadImpl(set: SessionSetter): Promise<void> {
  const sequence = ++sessionRequestSequence
  try {
    const info = await api.session()
    if (sequence !== sessionRequestSequence) return
    await persistSession(info)
    if (sequence !== sessionRequestSequence) return
    adopt(info, set)
  } catch (err) {
    if (sequence !== sessionRequestSequence) return
    if (err instanceof ApiError && err.isOffline && await adoptCachedSession(set, sequence)) return
    set({
      status: 'anonymous',
      authError: err instanceof ApiError ? err.message : t("session.could_not_connect_to_the_server"),
    })
  }
}

async function adoptCachedSession(set: SessionSetter, sequence: number): Promise<boolean> {
  const cached = await localDb.loadSession()
  if (sequence !== sessionRequestSequence) return false
  if (!cached?.user) return false
  adopt(cached, set)
  return true
}

async function passwordLoginImpl(set: SessionSetter, username: string, password: string): Promise<TotpLoginChallenge | null> {
  const sequence = ++sessionRequestSequence
  const result = await api.auth.login(username, password)
  if (sequence !== sessionRequestSequence) return null
  if ('twoFactorRequired' in result) return result
  const info = result
  await persistSession(info)
  if (sequence !== sessionRequestSequence) return null
  adopt(info, set)
  return null
}

async function totpLoginImpl(set: SessionSetter, challengeToken: string, code: string): Promise<void> {
  const sequence = ++sessionRequestSequence
  const info = await api.auth.totp.completeLogin(challengeToken, code)
  if (sequence !== sessionRequestSequence) return
  await persistSession(info)
  if (sequence !== sessionRequestSequence) return
  adopt(info, set)
  if (info.recoveryCodeUsed) {
    useUi.getState().toast({
      title: t('auth.recovery_code_used'),
      description: t('auth.recovery_codes_remaining', {
        count: info.recoveryCodesRemaining ?? 0,
      }),
      tone: info.recoveryCodesRemaining && info.recoveryCodesRemaining > 2 ? 'success' : 'danger',
    })
  }
}

async function passwordRegisterImpl(set: SessionSetter, username: string, password: string): Promise<void> {
  const sequence = ++sessionRequestSequence
  const info = await api.auth.register(username, password)
  if (sequence !== sessionRequestSequence) return
  await persistSession(info)
  if (sequence !== sessionRequestSequence) return
  adopt(info, set)
}

async function refreshImpl(set: SessionSetter): Promise<void> {
  const sequence = ++sessionRequestSequence
  const info = await api.session()
  if (sequence !== sessionRequestSequence) return
  await persistSession(info)
  if (sequence !== sessionRequestSequence) return
  adopt(info, set)
}

async function refreshSettingsImpl(set: SessionSetter, get: () => SessionState): Promise<void> {
  const epoch = settingsEpoch
  const sequence = ++settingsRequestSequence
  const remote = await api.settings.get()
  if (epoch !== settingsEpoch || sequence !== settingsRequestSequence) return
  const localPatch = outstandingSettingsPatch()
  const settings = localPatch ? mergeSettingsPatch(remote, localPatch) : remote
  set({ settings })
  syncAppearanceToDom(settings)
  cacheCurrentSession(get())
}

async function updateProfileImpl(set: SessionSetter, get: () => SessionState, patch: { name?: string; avatarUrl?: string }): Promise<PublicUser> {
  const before = get().user
  if (before) {
    set({ user: { ...before, ...patch } })
    cacheCurrentSession(get())
  }
  try {
    const user = await api.auth.updateProfile(patch)
    const current = get().user
    if (current?.id === user.id) {
      set({
        user: {
          ...user,
          name: patch.name === undefined || current.name !== patch.name ? current.name : user.name,
          avatarUrl: patch.avatarUrl === undefined || current.avatarUrl !== patch.avatarUrl
            ? current.avatarUrl
            : user.avatarUrl,
        },
      })
      cacheCurrentSession(get())
    }
    return user
  } catch (error) {
    const current = get().user
    if (before && current?.id === before.id) {
      set({
        user: {
          ...current,
          ...(patch.name !== undefined && current.name === patch.name ? { name: before.name } : {}),
          ...(patch.avatarUrl !== undefined && current.avatarUrl === patch.avatarUrl
            ? { avatarUrl: before.avatarUrl }
            : {}),
        },
      })
      cacheCurrentSession(get())
    }
    throw error
  }
}

async function updateRegistrationImpl(set: SessionSetter, get: () => SessionState, enabled: boolean, password: string): Promise<void> {
  const before = get().site
  const sequence = ++registrationMutationSequence
  if (before) {
    set({ site: { ...before, registrationOpen: enabled } })
    cacheCurrentSession(get())
  }
  try {
    const result = await api.auth.updateRegistration(enabled, password)
    if (sequence === registrationMutationSequence && get().site) {
      set({ site: { ...get().site!, registrationOpen: result.registrationOpen } })
      cacheCurrentSession(get())
    }
  } catch (error) {
    if (sequence === registrationMutationSequence && before) {
      set({ site: before })
      cacheCurrentSession(get())
    }
    throw error
  }
}

async function logoutImpl(set: SessionSetter, get: () => SessionState): Promise<void> {
  if (logoutPromise) return logoutPromise
  const task = (async () => {
    // Push unsaved offline edits before clearing local data, otherwise
    // they would be silently dropped. Dynamic import keeps the session
    // store free of a circular dependency on the notes store.
    const pending = await flushNotesBeforeLogout()

    window.clearTimeout(saveTimer)
    if (isSettingsSaveInFlight) await settingsSaveCompletion
    window.clearTimeout(saveTimer)
    await flushSettingsPatch(set, get)
    const unsaved = pending + (pendingSettingsPatch ? 1 : 0)
    if (unsaved > 0) {
      const proceed = window.confirm(t('session.logout_pending_changes', { count: String(unsaved) }))
      if (!proceed) return
    }

    try {
      await api.logout()
    } catch (err) {
      useUi.getState().toast({
        title: t('session.logout_failed'),
        description: err instanceof ApiError ? err.message : String(err),
        tone: 'danger',
      })
      return
    }

    sessionRequestSequence++
    sessionCacheEpoch++
    const pendingSessionCache = sessionCacheTask
    resetSettingsPersistence(null)
    await pendingSessionCache.catch(() => {})
    await localDb.clear()
    set({ status: 'anonymous', user: null, settings: DEFAULT_SETTINGS })
    location.reload()
  })()
  logoutPromise = task
  try {
    await task
  } finally {
    if (logoutPromise === task) logoutPromise = null
  }
}

async function flushNotesBeforeLogout(): Promise<number> {
  let pending = 0
  try {
    const { useNotes } = await import('../store/notes')
    try {
      await useNotes.getState().flush({ immediate: true })
    } catch {
      pending = Math.max(1, useNotes.getState().pendingCount)
    }
    pending = Math.max(pending, useNotes.getState().pendingCount)
  } catch {
    pending = 1
  }
  return pending
}

function updateSettingsImpl(
  set: SessionSetter,
  get: () => SessionState,
  patch: DeepPartial<UserSettings>,
  options?: { silent?: boolean },
): void {
  const currentSettings = get().settings
  const next = mergeSettingsPatch(currentSettings, patch)
  const nodeEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
  if (import.meta.env?.DEV || nodeEnv?.env?.NODE_ENV === 'test') {
    assertUnchangedSettingsSections(currentSettings, next, patch)
  }
  set({ settings: next })
  syncAppearanceToDom(next)
  cacheCurrentSession(get())
  pendingSettingsPatch = mergeSettingsPatches(pendingSettingsPatch, patch)
  shouldNotifyPendingSettings ||= !options?.silent


  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void flushSettingsPatch(set, get), 420)
}

async function flushSettingsPatch(set: SessionSetter, get: () => SessionState): Promise<void> {
  saveTimer = undefined
  if (isSettingsSaveInFlight || !pendingSettingsPatch) return

  const outgoing = pendingSettingsPatch
  const shouldNotify = shouldNotifyPendingSettings
  pendingSettingsPatch = null
  shouldNotifyPendingSettings = false
  inFlightSettingsPatch = outgoing
  isSettingsSaveInFlight = true
  let resolveCompletion!: () => void
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })
  settingsSaveCompletion = completion
  const epoch = settingsEpoch
  const token = ++settingsSaveToken
  const responseSequence = ++settingsRequestSequence
  try {
    const saved = await api.settings.save(outgoing as Partial<UserSettings>)
    if (epoch !== settingsEpoch || token !== settingsSaveToken) return
    settingsRetryDelay = 1_500
    applySavedSettings(saved, responseSequence, set, get)
  } catch (err) {
    if (epoch !== settingsEpoch || token !== settingsSaveToken) return
    scheduleSettingsRetry(err, outgoing, shouldNotify, set, get)
  } finally {
    if (epoch === settingsEpoch && token === settingsSaveToken) {
      inFlightSettingsPatch = null
      isSettingsSaveInFlight = false
      if (pendingSettingsPatch && saveTimer === undefined) {
        saveTimer = window.setTimeout(() => void flushSettingsPatch(set, get), 0)
      }
    }
    resolveCompletion()
  }
}

function applySavedSettings(saved: UserSettings, responseSequence: number, set: SessionSetter, get: () => SessionState): void {
  if (responseSequence !== settingsRequestSequence) return
  const settings = pendingSettingsPatch
    ? mergeSettingsPatch(saved, pendingSettingsPatch)
    : saved
  set({ settings })
  syncAppearanceToDom(settings)
  cacheCurrentSession(get())
}

function scheduleSettingsRetry(err: unknown, outgoing: DeepPartial<UserSettings>, shouldNotify: boolean, set: SessionSetter, get: () => SessionState): void {
  pendingSettingsPatch = mergeSettingsPatches(outgoing, pendingSettingsPatch)
  if (shouldNotify) {
    useUi.getState().toast({
      title: t("session.could_not_save_settings"),
      description: err instanceof ApiError ? err.message : String(err),
      tone: 'danger',
    })
  }
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(
    () => void flushSettingsPatch(set, get),
    settingsRetryDelay,
  )
  settingsRetryDelay = Math.min(30_000, settingsRetryDelay * 2)
}

function resetSettingsPersistence(userId: string | null): void {
  window.clearTimeout(saveTimer)
  saveTimer = undefined
  pendingSettingsPatch = null
  inFlightSettingsPatch = null
  shouldNotifyPendingSettings = false
  isSettingsSaveInFlight = false
  settingsSaveCompletion = Promise.resolve()
  settingsRetryDelay = 1_500
  settingsUserId = userId
  settingsEpoch++
  settingsSaveToken++
  settingsRequestSequence++
}

function outstandingSettingsPatch(): DeepPartial<UserSettings> | null {
  return mergeSettingsPatches(inFlightSettingsPatch, pendingSettingsPatch)
}

function mergeSettingsPatches(
  first: DeepPartial<UserSettings> | null,
  second: DeepPartial<UserSettings> | null,
): DeepPartial<UserSettings> | null {
  if (!first) return second
  if (!second) return first
  return {
    ...(first.appearance || second.appearance
      ? { appearance: { ...first.appearance, ...second.appearance } }
      : {}),
    ...(first.editor || second.editor
      ? { editor: { ...first.editor, ...second.editor } }
      : {}),
    ...(first.preview || second.preview
      ? { preview: { ...first.preview, ...second.preview } }
      : {}),
    ...(first.backup || second.backup
      ? { backup: { ...first.backup, ...second.backup } }
      : {}),
    ...(first.sync || second.sync
      ? { sync: { ...first.sync, ...second.sync } }
      : {}),
    ...(first.notes || second.notes
      ? { notes: { ...first.notes, ...second.notes } }
      : {}),
  }
}

function adopt(info: SessionInfo, set: (partial: Partial<SessionState>) => void): void {
  const nextUserId = info.user?.id ?? null
  if (settingsUserId !== nextUserId) resetSettingsPersistence(nextUserId)
  const remote = mergeSettings(info.settings ?? {})
  const localPatch = outstandingSettingsPatch()
  const settings = localPatch ? mergeSettingsPatch(remote, localPatch) : remote
  set({
    status: info.user ? 'authed' : 'anonymous',
    user: info.user,
    site: info.site,
    settings,
    authError: null,
  })
  if (info.user) syncAppearanceToDom(settings)
}

async function persistSession(info: SessionInfo): Promise<void> {
  if (info.user) await queueSessionCache(info)
  else {
    sessionCacheEpoch++
    await sessionCacheTask.catch(() => {})
    await localDb.clearSession()
  }
}

function cacheCurrentSession(state: SessionState): void {
  if (!state.user || !state.site) return
  void queueSessionCache({ user: state.user, site: state.site, settings: state.settings })
}

function queueSessionCache(info: SessionInfo): Promise<void> {
  const epoch = sessionCacheEpoch
  const task = sessionCacheTask.then(async () => {
    if (epoch === sessionCacheEpoch) await localDb.saveSession(info)
  })
  sessionCacheTask = task.catch(() => {})
  return task
}


export function syncAppearanceToDom(settings: UserSettings): void {
  const { appearance, preview } = settings
  const root = document.documentElement
  root.style.setProperty('--prose-size', `${appearance.proseSize}px`)
  root.style.setProperty('--prose-line', String(appearance.proseLineHeight))
  root.style.setProperty(
    '--prose-width',
    { narrow: '58ch', normal: '72ch', wide: '88ch', full: '100%' }[appearance.proseWidth] ?? '72ch',
  )
  root.style.setProperty('--editor-size', `${settings.editor.fontSize}px`)
  root.dataset.preview = preview.layout
  setLocale(appearance.language)

  const ui = useUi.getState()
  ui.applyAppearance({
    theme: appearance.theme,
    accent: appearance.accent,
    background: appearance.background,
    fontScale: appearance.proseSize,
  })
  if (ui.density !== appearance.density) useUi.setState({ density: appearance.density })
}

export function watchSystemTheme(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (useSession.getState().settings.appearance.theme === 'system') {
      applyThemeToDom(useUi.getState())
    }
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}