import { useEffect, useMemo, useRef, useState } from 'react'
import { type McpGrant, type McpSettingsInfo } from '@shared/types'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { IS_DEMO_MODE } from '../../../lib/runtime'
import { confirm } from '../../../components/overlay'
import { useUi } from '../../../store/ui'
import { clientSnippets } from './snippets'

type BusyAction =
  | 'global'
  | 'write'
  | 'trash'
  | 'revoke'
  | 'keyCreate'
  | 'keyRevoke'
  | 'aiSearch'
  | 'aiReindex'
  | 'aiClear'
  | null

type McpCore = ReturnType<typeof useMcpCore>

export type McpSettingsState = ReturnType<typeof useMcpSettings>

function useMcpCore() {
  const displayOnly = IS_DEMO_MODE
  const toast = useUi((state) => state.toast)
  const [info, setInfo] = useState<McpSettingsInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [keyName, setKeyName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const busyRef = useRef<BusyAction>(null)
  return { displayOnly, toast, info, setInfo, isLoading, setIsLoading, loadError, setLoadError, busy, setBusy, copied, setCopied, keyName, setKeyName, newToken, setNewToken, mountedRef, busyRef }
}

export function useMcpSettings() {
  const core = useMcpCore()
  const load = () => void loadMcpFlow(core)
  useEffect(() => {
    core.mountedRef.current = true
    void loadMcpFlow(core)
    return () => {
      core.mountedRef.current = false
    }
  }, [])
  const savePreference = (action: Exclude<BusyAction, null>, body: Parameters<typeof api.mcp.save>[0], successTitle = t('settings.mcp_updated')) => void savePreferenceFlow(core, action, body, successTitle)
  const revoke = (grant: McpGrant) => void revokeGrantFlow(core, grant)
  const revokeAll = () => void revokeAllGrantsFlow(core)
  const createKey = () => void createKeyFlow(core)
  const revokeKey = (id: string, name: string) => void revokeKeyFlow(core, id, name)
  const toggleAiSearch = (enabled: boolean) => void toggleAiFlow(core, enabled)
  const reindexAi = () => void reindexAiFlow(core)
  const clearAi = () => void clearAiFlow(core)
  const copy = (id: string, value: string) => void copyFlow(core, id, value)
  const snippets = useMemo(() => core.info ? clientSnippets(core.info) : [], [core.info])
  return { displayOnly: core.displayOnly, info: core.info, isLoading: core.isLoading, loadError: core.loadError, busy: core.busy, copied: core.copied, keyName: core.keyName, setKeyName: core.setKeyName, newToken: core.newToken, setNewToken: core.setNewToken, load, savePreference, revoke, revokeAll, createKey, revokeKey, toggleAiSearch, reindexAi, clearAi, copy, snippets }
}

async function loadMcpFlow(core: McpCore) {
  core.setIsLoading(true)
  core.setLoadError(null)
  try {
    const next = await api.mcp.get()
    if (core.mountedRef.current) core.setInfo(next)
  }
  catch (error) {
    if (core.mountedRef.current) core.setLoadError(errorMessage(error))
  }
  finally {
    if (core.mountedRef.current) core.setIsLoading(false)
  }
}

function beginBusy(core: McpCore, action: Exclude<BusyAction, null>): boolean {
  if (core.busyRef.current) return false
  core.busyRef.current = action
  core.setBusy(action)
  return true
}

function endBusy(core: McpCore) {
  core.busyRef.current = null
  if (core.mountedRef.current) core.setBusy(null)
}

function failMcp(core: McpCore, error: unknown) {
  core.toast({
    title: t('common.action_failed'),
    description: errorMessage(error),
    tone: 'danger',
  })
}

async function savePreferenceFlow(core: McpCore, action: Exclude<BusyAction, null>, body: Parameters<typeof api.mcp.save>[0], successTitle: string): Promise<boolean> {
  if (!beginBusy(core, action)) return false
  try {
    const result = await api.mcp.save(body)
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        enabled: result.enabled,
        preferences: result.preferences,
      }))
    }
    core.toast({
      title: successTitle,
      description: result.reconnectRequired ? t('settings.mcp_reconnect_notice') : undefined,
      tone: 'success',
    })
    return true
  }
  catch (error) {
    failMcp(core, error)
    return false
  }
  finally {
    endBusy(core)
  }
}

async function revokeGrantFlow(core: McpCore, grant: McpGrant) {
  const approved = await confirm({
    title: t('settings.mcp_revoke_title'),
    description: t('settings.mcp_revoke_desc', { name: grant.clientName }),
    confirmLabel: t('settings.mcp_revoke'),
    tone: 'danger',
  })
  if (!approved || !beginBusy(core, 'revoke')) return
  try {
    await api.mcp.revokeGrant(grant.id)
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        grants: current.grants.filter((item) => item.id !== grant.id),
      }))
    }
    core.toast({ title: t('settings.mcp_grant_revoked'), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function revokeAllGrantsFlow(core: McpCore) {
  const approved = await confirm({
    title: t('settings.mcp_revoke_all_title'),
    description: t('settings.mcp_revoke_all_desc'),
    confirmLabel: t('settings.mcp_revoke_all'),
    tone: 'danger',
  })
  if (!approved || !beginBusy(core, 'revoke')) return
  try {
    const result = await api.mcp.revokeAllGrants()
    if (core.mountedRef.current) core.setInfo((current) => current && ({ ...current, grants: [] }))
    core.toast({ title: t('settings.mcp_revoked_count', { count: result.revoked }), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function createKeyFlow(core: McpCore) {
  if (core.displayOnly || !core.info?.enabled || core.busyRef.current) return
  const name = core.keyName.trim()
  if (!name) {
    core.toast({ title: t('settings.mcp_api_key_name_required'), tone: 'danger' })
    return
  }
  if (!beginBusy(core, 'keyCreate')) return
  try {
    const result = await api.mcp.createKey(name)
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        apiKeys: [result.key, ...current.apiKeys],
      }))
      core.setKeyName('')
      core.setNewToken(result.token)
    }
    core.toast({ title: t('settings.mcp_api_key_created'), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function revokeKeyFlow(core: McpCore, id: string, name: string) {
  const approved = await confirm({
    title: t('settings.mcp_api_key_revoke_title'),
    description: t('settings.mcp_api_key_revoke_desc', { name }),
    confirmLabel: t('settings.mcp_api_key_revoke'),
    tone: 'danger',
  })
  if (!approved || !beginBusy(core, 'keyRevoke')) return
  try {
    await api.mcp.revokeKey(id)
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        apiKeys: current.apiKeys.filter((key) => key.id !== id),
      }))
    }
    core.toast({ title: t('settings.mcp_api_key_revoked'), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function toggleAiFlow(core: McpCore, enabled: boolean) {
  if (!beginBusy(core, 'aiSearch')) return
  try {
    const status = await api.mcp.aiSearch.save(enabled)
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        aiSearch: status,
      }))
    }
    core.toast({ title: enabled ? t('settings.mcp_ai_search_enabled') : t('settings.mcp_ai_search_disabled'), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function reindexAiFlow(core: McpCore) {
  const approved = await confirm({
    title: t('settings.mcp_ai_search_reindex_title'),
    description: t('settings.mcp_ai_search_reindex_desc'),
    confirmLabel: t('settings.mcp_ai_search_reindex'),
  })
  if (!approved || !beginBusy(core, 'aiReindex')) return
  try {
    const result = await api.mcp.aiSearch.reindex()
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        aiSearch: result,
      }))
    }
    core.toast({ title: t('settings.mcp_ai_search_reindexed', { count: result.enqueued }), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function clearAiFlow(core: McpCore) {
  const approved = await confirm({
    title: t('settings.mcp_ai_search_clear_title'),
    description: t('settings.mcp_ai_search_clear_desc'),
    confirmLabel: t('settings.mcp_ai_search_clear'),
    tone: 'danger',
  })
  if (!approved || !beginBusy(core, 'aiClear')) return
  try {
    const result = await api.mcp.aiSearch.clear()
    if (core.mountedRef.current) {
      core.setInfo((current) => current && ({
        ...current,
        aiSearch: { ...current.aiSearch, indexedCount: 0, pendingCount: 0 },
      }))
    }
    core.toast({ title: t('settings.mcp_ai_search_cleared', { count: result.removed }), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
  finally {
    endBusy(core)
  }
}

async function copyFlow(core: McpCore, id: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    core.setCopied(id)
    window.setTimeout(() => {
      if (core.mountedRef.current) core.setCopied((current) => current === id ? null : current)
    }, 1_800)
    core.toast({ title: t('settings.mcp_copied'), tone: 'success' })
  }
  catch (error) {
    failMcp(core, error)
  }
}
