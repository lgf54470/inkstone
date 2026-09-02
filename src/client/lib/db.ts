import { clear as clearStore, createStore, del, get, getMany, set, setMany, update } from 'idb-keyval'
import * as idbKeyval from 'idb-keyval'
import type { UseStore } from 'idb-keyval'
import type { Folder, Note, NoteSummary, NoteTemplate, NoteTemplateCategory, PublicUser, SessionInfo, SiteInfo, Tag } from '@shared/types'
import { CLIENT_DATABASE_NAME } from './runtime'

const optionalIdbExport = (name: string): unknown => Object.prototype.hasOwnProperty.call(idbKeyval, name)
  ? Reflect.get(idbKeyval, name)
  : undefined
const delMany = optionalIdbExport('delMany') as ((keys: IDBValidKey[], store?: UseStore) => Promise<void>) | undefined
const entries = optionalIdbExport('entries') as (<KeyType extends IDBValidKey, ValueType = unknown>(store?: UseStore) => Promise<[KeyType, ValueType][]>) | undefined

const store = createStore(CLIENT_DATABASE_NAME, 'kv')

const KEY = {
  notes: 'notes',
  noteIndex: 'noteIndex',
  folders: 'folders',
  tags: 'tags',
  cursor: 'cursor',
  summary: (id: string) => `note-summary:${id}`,
  content: (id: string) => `note:${id}`,
  outbox: 'outbox',
  outboxReplayLease: 'outboxReplayLease',
  userId: 'userId',
  session: 'session',
  templateLibrary: 'templateLibrary',
} as const

interface ShellData {
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  cursor: number
}

interface ShellBaseline {
  userId: string
  notes: Map<string, NoteSummary>
  folders: Folder[]
  tags: Tag[]
  cursor: number
}

export interface TemplateLibraryData {
  categories: NoteTemplateCategory[]
  templates: NoteTemplate[]
  seedVersion: number
}

const supportsUserNamespaces = typeof entries === 'function' && typeof delMany === 'function'
let forceUserNamespaces = false
// The shell cache is two-level: one `note-summary:<id>` key per note plus a
// lightweight `noteIndex` id list. A typing-derived summary commit therefore
// only upserts the one changed note instead of re-serializing the whole vault;
// boot still reads every summary in a single getMany over the index. The shell
// is a read cache for the next boot, not a source of truth: the coalescing
// window collapses bursts into one flush (a lost tail at most delays the
// cached shell by one window on abrupt close), and the flush tail chain keeps
// each diff-based write from racing the previous one.
const SHELL_SAVE_COALESCE_MS = 800
const SHELL_SET_CHUNK = 400
let shellSaveTimer = 0
let pendingShell: ShellData | null = null
let pendingShellUserId: string | null = null
let activeUserId: string | null = null
let shellBaseline: ShellBaseline | null = null
let shellFlushTail: Promise<void> = Promise.resolve()
let shellEpoch = 0

export interface OutboxItem {
  id: string
  clientId: string
  writeId: string
  dependsOnWriteId?: string
  noteId: string
  payload: Record<string, unknown>
  attempts: number
  createdAt: number
  lastError?: string
}

export interface CachedNoteContent {
  content: string
  rev: number
  updatedAt: number
  writeId?: string
  pendingTitle?: string
  contentDirty?: boolean
}

function normalizeOutbox(value: unknown): OutboxItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is OutboxItem => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<OutboxItem>
    return typeof candidate.id === 'string' &&
      typeof candidate.clientId === 'string' &&
      typeof candidate.writeId === 'string' &&
      typeof candidate.noteId === 'string' &&
      Boolean(candidate.payload) &&
      typeof candidate.payload === 'object' &&
      !Array.isArray(candidate.payload) &&
      typeof candidate.attempts === 'number' &&
      Number.isInteger(candidate.attempts) &&
      typeof candidate.createdAt === 'number' &&
      Number.isFinite(candidate.createdAt)
  })
}

async function safeGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, store)
  } catch {
    return undefined
  }
}

async function safeSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, store)
  } catch {
  }
}

function userScopedKey(key: string, userId = activeUserId): string {
  return userId && (supportsUserNamespaces || forceUserNamespaces) ? `user:${userId}:${key}` : key
}

function isLegacyDataKey(key: unknown): key is string {
  return key === KEY.notes || key === KEY.noteIndex || key === KEY.folders || key === KEY.tags ||
    key === KEY.cursor || key === KEY.outbox || key === KEY.outboxReplayLease ||
    (typeof key === 'string' && (key.startsWith('note:') || key.startsWith('note-summary:')))
}

function resetShellIdentity(): void {
  shellBaseline = null
  shellEpoch++
}

async function migrateLegacyData(userId: string): Promise<void> {
  if (!supportsUserNamespaces) return
  const legacy = (await entries<string, unknown>(store)).filter(([key]) => isLegacyDataKey(key))
  if (!legacy.length) return
  const scopedKeys = await getMany(legacy.map(([key]) => userScopedKey(key, userId)), store)
  const writes: [string, unknown][] = []
  for (let index = 0; index < legacy.length; index++) {
    if (scopedKeys[index] === undefined) {
      writes.push([userScopedKey(legacy[index]![0], userId), legacy[index]![1]])
    }
  }
  if (writes.length) await setMany(writes, store)
  await delMany(legacy.map(([key]) => key), store)
}

async function bindLocalUser(userId: string): Promise<void> {
  if (activeUserId === userId) {
    if (forceUserNamespaces && !supportsUserNamespaces) {
      await clearLocalData()
      forceUserNamespaces = false
    }
    await set(KEY.userId, userId, store)
    return
  }
  if (!supportsUserNamespaces) {
    const storedUserId = await safeGet<string>(KEY.userId)
    if (storedUserId !== userId) {
      try {
        await clearLocalData()
        forceUserNamespaces = false
      } catch (error) {
        activeUserId = userId
        resetShellIdentity()
        forceUserNamespaces = true
        throw error
      }
    }
    activeUserId = userId
    resetShellIdentity()
    await set(KEY.userId, userId, store)
    return
  }
  activeUserId = userId
  resetShellIdentity()
  const legacyUserId = await safeGet<string>(KEY.userId)
  if (legacyUserId === userId) await migrateLegacyData(userId)
  await set(KEY.userId, userId, store)
}

export const localDb = {
  async loadSession(): Promise<SessionInfo | null> {
    const value = await safeGet<unknown>(KEY.session)
    if (!isRecord(value) || !isPublicUser(value.user) || !isSiteInfo(value.site)) return null
    if (value.settings !== null && !isRecord(value.settings)) return null
    if (await safeGet<string>(KEY.userId) !== value.user.id) return null
    try {
      await bindLocalUser(value.user.id)
    } catch {
      return null
    }
    return value as unknown as SessionInfo
  },

  async saveSession(info: SessionInfo): Promise<void> {
    if (!info.user) return
    try {
      await bindLocalUser(info.user.id)
      await set(KEY.session, info, store)
    } catch {
    }
  },

  clearSession: () => del(KEY.session, store).catch(() => {}),

  async loadShell(): Promise<{
    notes: NoteSummary[]
    folders: Folder[]
    tags: Tag[]
    cursor: number
  } | null> {
    const userId = activeUserId
    if (!userId) return null
    const shellKeys = [
      userScopedKey(KEY.noteIndex, userId),
      userScopedKey(KEY.folders, userId),
      userScopedKey(KEY.tags, userId),
      userScopedKey(KEY.cursor, userId),
      userScopedKey(KEY.notes, userId),
    ]
    try {
      const values = await getMany(shellKeys, store)
      const index = values[0]
      const folders = values[1]
      const tags = values[2]
      const cursor = values[3]
      const legacyNotes = values[4]
      let notes: NoteSummary[] | null = null
      if (Array.isArray(index) && index.every((id) => typeof id === 'string')) {
        const ids = index as string[]
        const summaries = await getMany(ids.map((id) => userScopedKey(KEY.summary(id), userId)), store)
        if (summaries.every(isNoteSummary)) notes = summaries as NoteSummary[]
      }
      else if (Array.isArray(legacyNotes) && legacyNotes.every(isNoteSummary)) {
        notes = legacyNotes as NoteSummary[]
        const writes: [string, unknown][] = notes.map((note) => [userScopedKey(KEY.summary(note.id), userId), note])
        writes.push([userScopedKey(KEY.noteIndex, userId), notes.map((note) => note.id)])
        for (let start = 0; start < writes.length; start += SHELL_SET_CHUNK)
          await setMany(writes.slice(start, start + SHELL_SET_CHUNK), store)
        await del(userScopedKey(KEY.notes, userId), store)
      }
      if (!notes ||
        !Array.isArray(folders) || !folders.every(isFolder) ||
        !Array.isArray(tags) || !tags.every(isTag) ||
        typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0
      ) {
        return null
      }
      shellBaseline = {
        userId,
        notes: new Map(notes.map((note) => [note.id, note])),
        folders: folders as Folder[],
        tags: tags as Tag[],
        cursor,
      }
      return {
        notes,
        folders: folders as Folder[],
        tags: tags as Tag[],
        cursor,
      }
    } catch {
      return null
    }
  },

  async saveShell(data: ShellData, userId = activeUserId) {
    const epoch = shellEpoch
    const run = async () => {
      try {
        if (epoch !== shellEpoch) return
        const baseline = userId !== null && shellBaseline?.userId === userId ? shellBaseline : null
        const targetNotes = new Map(data.notes.map((note) => [note.id, note] as const))
        const writes: [string, unknown][] = []
        let indexChanged = baseline === null
        if (baseline) {
          for (const note of data.notes) {
            const previous = baseline.notes.get(note.id)
            if (previous === undefined || !summariesEqual(previous, note)) {
              writes.push([userScopedKey(KEY.summary(note.id), userId), note])
              if (previous === undefined) indexChanged = true
            }
          }
          const removedIds: string[] = []
          for (const id of baseline.notes.keys()) {
            if (!targetNotes.has(id)) removedIds.push(id)
          }
          if (removedIds.length) {
            indexChanged = true
            const removedKeys = removedIds.map((id) => userScopedKey(KEY.summary(id), userId))
            if (delMany) await delMany(removedKeys, store)
            else for (const key of removedKeys) await del(key, store)
          }
          if (indexChanged) {
            const nextIds = await mergedNoteIds(userId, [...targetNotes.keys()], new Set(removedIds))
            writes.push([userScopedKey(KEY.noteIndex, userId), nextIds])
          }
        }
        else {
          for (const note of data.notes)
            writes.push([userScopedKey(KEY.summary(note.id), userId), note])
          writes.push([userScopedKey(KEY.noteIndex, userId), data.notes.map((note) => note.id)])
        }
        if (!baseline || !foldersEqual(baseline.folders, data.folders))
          writes.push([userScopedKey(KEY.folders, userId), data.folders])
        if (!baseline || !tagsEqual(baseline.tags, data.tags))
          writes.push([userScopedKey(KEY.tags, userId), data.tags])
        if (!baseline || baseline.cursor !== data.cursor)
          writes.push([userScopedKey(KEY.cursor, userId), data.cursor])
        if (writes.length) {
          for (let start = 0; start < writes.length; start += SHELL_SET_CHUNK)
            await setMany(writes.slice(start, start + SHELL_SET_CHUNK), store)
        }
        if (epoch === shellEpoch) {
          shellBaseline = {
            userId: userId ?? '',
            notes: targetNotes,
            folders: data.folders,
            tags: data.tags,
            cursor: data.cursor,
          }
        }
      } catch {
      }
    }
    const queued = shellFlushTail.then(run, run)
    shellFlushTail = queued.catch(() => {})
    await queued
  },

  scheduleShellSave(data: ShellData) {
    pendingShell = data
    pendingShellUserId = activeUserId
    window.clearTimeout(shellSaveTimer)
    shellSaveTimer = window.setTimeout(() => {
      const snapshot = pendingShell
      const userId = pendingShellUserId
      pendingShell = null
      pendingShellUserId = null
      if (snapshot) void localDb.saveShell(snapshot, userId)
    }, SHELL_SAVE_COALESCE_MS)
  },

  async getContent(id: string): Promise<CachedNoteContent | undefined> {
    const value = await safeGet<unknown>(userScopedKey(KEY.content(id)))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const cached = value as Partial<CachedNoteContent>
    if (
      typeof cached.content !== 'string' ||
      !Number.isSafeInteger(cached.rev) ||
      cached.rev! < 1 ||
      typeof cached.updatedAt !== 'number' ||
      !Number.isFinite(cached.updatedAt) ||
      (cached.writeId !== undefined && typeof cached.writeId !== 'string') ||
      (cached.pendingTitle !== undefined && typeof cached.pendingTitle !== 'string') ||
      (cached.contentDirty !== undefined && typeof cached.contentDirty !== 'boolean')
    ) {
      return undefined
    }
    return cached as CachedNoteContent
  },
  setContent: (id: string, value: CachedNoteContent) =>
    safeSet(userScopedKey(KEY.content(id)), value),
  dropContent: (id: string) => del(userScopedKey(KEY.content(id)), store).catch(() => {}),

  async loadTemplateLibrary(): Promise<TemplateLibraryData | null> {
    const value = await safeGet<unknown>(userScopedKey(KEY.templateLibrary))
    if (!isRecord(value)) return null
    const categories = Array.isArray(value.categories)
      ? value.categories.filter(isNoteTemplateCategory)
      : []
    const templates = Array.isArray(value.templates)
      ? value.templates.filter(isNoteTemplate).map((template) => ({ ...template, tags: template.tags ?? [] }))
      : []
    const seedVersion = isFiniteNumber(value.seedVersion) ? value.seedVersion : 0
    return { categories, templates, seedVersion }
  },

  saveTemplateLibrary: (data: TemplateLibraryData) =>
    safeSet(userScopedKey(KEY.templateLibrary), data),

  getOutbox: async (): Promise<OutboxItem[]> => normalizeOutbox(await safeGet<unknown>(userScopedKey(KEY.outbox))),

  enqueueOutbox(item: OutboxItem): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => {
        const items = normalizeOutbox(current)
        const previous = items.find((entry) => entry.id === item.id)
        return [
          ...items.filter((entry) => entry.id !== item.id),
          { ...item, createdAt: previous?.createdAt ?? item.createdAt },
        ]
      },
      store,
    )
  },

  completeOutboxItem(id: string, writeId: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .filter((item) => item.id !== id || item.writeId !== writeId),
      store,
    )
  },

  updateOutboxRevision(
    id: string,
    writeId: string,
    rev: number,
    preserveVersion = false,
  ): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? {
              ...item,
              dependsOnWriteId: undefined,
              payload: {
                ...item.payload,
                rev,
                ...(preserveVersion ? { preserveVersion: true } : {}),
              },
            }
          : item),
      store,
    )
  },

  setOutboxRecoveryId(id: string, writeId: string, recoveryId: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? { ...item, payload: { ...item.payload, recoveryId } }
          : item),
      store,
    )
  },

  advanceOutboxDependents(
    noteId: string,
    sourceWriteId: string,
    expectedRev: number,
    nextRev: number,
  ): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.noteId === noteId &&
            item.dependsOnWriteId === sourceWriteId &&
            item.payload.rev === expectedRev
          ? { ...item, dependsOnWriteId: undefined, payload: { ...item.payload, rev: nextRev } }
          : item),
      store,
    )
  },

  markOutboxFailure(id: string, writeId: string, message: string): Promise<void> {
    return update<OutboxItem[]>(
      userScopedKey(KEY.outbox),
      (current) => normalizeOutbox(current)
        .map((item) => item.id === id && item.writeId === writeId
          ? { ...item, attempts: item.attempts + 1, lastError: message }
          : item),
      store,
    )
  },

  async withOutboxReplayLock(owner: string, task: () => Promise<void>): Promise<boolean> {
    const lockName = activeUserId ? `inkstone-outbox-replay:${activeUserId}` : 'inkstone-outbox-replay'
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      let acquired = false
      await navigator.locks.request(
        lockName,
        async () => {
          acquired = true
          await task()
        },
      )
      return acquired
    }

    const leaseMs = 90_000
    let acquired = false
    const deadline = Date.now() + 30_000
    while (!acquired && Date.now() < deadline) {
      const now = Date.now()
      await update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => {
          if (!current || current.expiresAt <= now) {
            acquired = true
            return { owner, expiresAt: now + leaseMs }
          }
          return current
        },
        store,
      )
      if (!acquired) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 50))
      }
    }
    if (!acquired) return false

    const heartbeat = globalThis.setInterval(() => {
      void update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => current?.owner === owner
          ? { owner, expiresAt: Date.now() + leaseMs }
          : current ?? null,
        store,
      ).catch(() => {})
    }, 20_000)
    try {
      await task()
      return true
    } finally {
      globalThis.clearInterval(heartbeat)
      await update<{ owner: string; expiresAt: number } | null>(
        userScopedKey(KEY.outboxReplayLease),
        (current) => current?.owner === owner ? null : current ?? null,
        store,
      ).catch(() => {})
    }
  },

  async bindUser(userId: string): Promise<void> {
    await bindLocalUser(userId)
  },

  async clear(): Promise<void> {
    try {
      await clearLocalData()
    } catch {
      await Promise.allSettled([
        del(KEY.session, store),
        del(KEY.userId, store),
      ])
    }
    activeUserId = null
    forceUserNamespaces = false
  },
}

async function clearLocalData(): Promise<void> {
  window.clearTimeout(shellSaveTimer)
  shellSaveTimer = 0
  pendingShell = null
  pendingShellUserId = null
  shellBaseline = null
  shellEpoch++
  shellFlushTail = Promise.resolve()
  await clearStore(store)
}

async function mergedNoteIds(userId: string | null, targetIds: string[], removedIds: Set<string>): Promise<string[]> {
  // An offline tab never sees another tab's brand-new notes; merging with the
  // on-disk index keeps those entries when this tab rewrites the index, while
  // ids this tab deleted are still dropped (stale ids heal on the next pull).
  let diskIds: string[] = []
  try {
    const value = await get<unknown>(userScopedKey(KEY.noteIndex, userId), store)
    if (Array.isArray(value) && value.every((id) => typeof id === 'string')) diskIds = value as string[]
  } catch {
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const id of [...diskIds, ...targetIds]) {
    if (removedIds.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

function summariesEqual(a: NoteSummary, b: NoteSummary): boolean {
  if (a === b) return true
  return a.id === b.id &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.folderId === b.folderId &&
    a.isPinned === b.isPinned &&
    a.isStarred === b.isStarred &&
    a.isArchived === b.isArchived &&
    a.wordCount === b.wordCount &&
    a.charCount === b.charCount &&
    a.rev === b.rev &&
    a.position === b.position &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.deletedAt === b.deletedAt &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
}

function foldersEqual(a: Folder[], b: Folder[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!
    const y = b[index]!
    if (x.id !== y.id || x.parentId !== y.parentId || x.name !== y.name || x.icon !== y.icon ||
      (x.color ?? null) !== (y.color ?? null) || x.position !== y.position ||
      x.createdAt !== y.createdAt || x.updatedAt !== y.updatedAt ||
      (x.noteCount ?? null) !== (y.noteCount ?? null)) {
      return false
    }
  }
  return true
}

function tagsEqual(a: Tag[], b: Tag[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    const x = a[index]!
    const y = b[index]!
    if (x.id !== y.id || x.name !== y.name || (x.color ?? null) !== (y.color ?? null) ||
      x.count !== y.count || x.createdAt !== y.createdAt) {
      return false
    }
  }
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPublicUser(value: unknown): value is PublicUser {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.login === 'string' &&
    typeof value.name === 'string' &&
    typeof value.avatarUrl === 'string' &&
    (value.role === 'owner' || value.role === 'member') &&
    isFiniteNumber(value.createdAt) &&
    typeof value.username === 'string'
}

function isSiteInfo(value: unknown): value is SiteInfo {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' &&
    typeof value.initialized === 'boolean' &&
    typeof value.registrationOpen === 'boolean' &&
    typeof value.r2Enabled === 'boolean' &&
    typeof value.kvEnabled === 'boolean' &&
    (value.attachmentStorage === 'r2' || value.attachmentStorage === 'kv' || value.attachmentStorage === null) &&
    typeof value.realtimeEnabled === 'boolean' &&
    typeof value.version === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isNoteSummary(value: unknown): value is NoteSummary {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.excerpt === 'string' &&
    isNullableString(value.folderId) &&
    Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.isPinned === 'boolean' &&
    typeof value.isStarred === 'boolean' &&
    typeof value.isArchived === 'boolean' &&
    isFiniteNumber(value.wordCount) &&
    isFiniteNumber(value.charCount) &&
    Number.isSafeInteger(value.rev) && (value.rev as number) >= 1 &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    isNullableNumber(value.deletedAt)
}

function isFolder(value: unknown): value is Folder {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    isNullableString(value.parentId) &&
    typeof value.name === 'string' &&
    isNullableString(value.icon) &&
    (value.color === undefined || isNullableString(value.color)) &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    (value.noteCount === undefined || isFiniteNumber(value.noteCount))
}

function isTag(value: unknown): value is Tag {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.color) &&
    isFiniteNumber(value.count) &&
    isFiniteNumber(value.createdAt)
}

function isNoteTemplateCategory(value: unknown): value is NoteTemplateCategory {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.builtin === 'boolean' &&
    isFiniteNumber(value.position) &&
    isFiniteNumber(value.createdAt)
}

function isNoteTemplate(value: unknown): value is NoteTemplate {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    isNullableString(value.categoryId) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.content === 'string' &&
    typeof value.builtin === 'boolean' &&
    typeof value.isPinned === 'boolean' &&
    typeof value.isStarred === 'boolean' &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'))) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
}

export type BroadcastPayload = (
  | { type: 'local-write'; clientId: string }
  | { type: 'pulled'; cursor: number; clientId: string }
  | { type: 'claim-leader'; clientId: string; at: number }
  | { type: 'settings-changed'; clientId: string }
  | { type: 'profile-changed'; clientId: string }
  | { type: 'site-changed'; clientId: string }
  | {
      type: 'outbox-base-advanced'
      clientId: string
      noteId: string
      writeId: string
      expectedRev: number
      nextRev: number
    }
  | {
      type: 'outbox-result'
      clientId: string
      targetClientId: string
      noteId: string
      writeId: string
      outcome: 'saved' | 'recovered'
      recoveryReason?: 'conflict' | 'deleted'
      rev?: number
      updatedAt?: number
      savedTitle?: string
      savedNote?: Note
      copyId?: string
    }
) & { userId?: string }

let broadcastPublisher: BroadcastChannel | null = null

export function publishBroadcast(payload: BroadcastPayload): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    broadcastPublisher ??= new BroadcastChannel('inkstone')
    broadcastPublisher.postMessage({ ...payload, userId: activeUserId })
  } catch {
  }
}

export function createBroadcast(
  onMessage: (payload: BroadcastPayload) => void,
): { post: (payload: BroadcastPayload) => void; close: () => void } {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} }
  }
  const channel = new BroadcastChannel('inkstone')
  channel.onmessage = (event) => {
    const payload = event.data as BroadcastPayload
    if (!activeUserId || payload?.userId !== activeUserId) return
    onMessage(payload)
  }
  return {
    post: (payload) => {
      try {
        channel.postMessage({ ...payload, userId: activeUserId })
      } catch {
      }
    },
    close: () => channel.close(),
  }
}
