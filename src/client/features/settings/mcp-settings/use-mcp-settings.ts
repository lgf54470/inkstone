import { useEffect, useMemo, useRef, useState } from 'react';
import { type McpGrant, type McpSettingsInfo } from '@shared/types';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { t } from '../../../lib/i18n';
import { IS_DEMO_MODE } from '../../../lib/runtime';
import { confirm } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { clientSnippets } from './snippets';

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

export function useMcpSettings() {
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

  const load = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const next = await api.mcp.get()
      if (mountedRef.current) setInfo(next)
    } catch (error) {
      if (mountedRef.current) setLoadError(errorMessage(error))
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [])

  const begin = (action: Exclude<BusyAction, null>): boolean => {
    if (busyRef.current) return false
    busyRef.current = action
    setBusy(action)
    return true
  }

  const finish = () => {
    busyRef.current = null
    if (mountedRef.current) setBusy(null)
  }

  const fail = (error: unknown) => {
    toast({
      title: t('common.action_failed'),
      description: errorMessage(error),
      tone: 'danger',
    })
  }

  const savePreference = async (
    action: Exclude<BusyAction, null>,
    body: Parameters<typeof api.mcp.save>[0],
    successTitle = t('settings.mcp_updated'),
  ): Promise<boolean> => {
    if (!begin(action)) return false
    try {
      const result = await api.mcp.save(body)
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          enabled: result.enabled,
          preferences: result.preferences,
        }))
      }
      toast({
        title: successTitle,
        description: result.reconnectRequired ? t('settings.mcp_reconnect_notice') : undefined,
        tone: 'success',
      })
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      finish()
    }
  }

  const revoke = async (grant: McpGrant) => {
    const approved = await confirm({
      title: t('settings.mcp_revoke_title'),
      description: t('settings.mcp_revoke_desc', { name: grant.clientName }),
      confirmLabel: t('settings.mcp_revoke'),
      tone: 'danger',
    })
    if (!approved || !begin('revoke')) return
    try {
      await api.mcp.revokeGrant(grant.id)
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          grants: current.grants.filter((item) => item.id !== grant.id),
        }))
      }
      toast({ title: t('settings.mcp_grant_revoked'), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const revokeAll = async () => {
    const approved = await confirm({
      title: t('settings.mcp_revoke_all_title'),
      description: t('settings.mcp_revoke_all_desc'),
      confirmLabel: t('settings.mcp_revoke_all'),
      tone: 'danger',
    })
    if (!approved || !begin('revoke')) return
    try {
      const result = await api.mcp.revokeAllGrants()
      if (mountedRef.current) setInfo((current) => current && ({ ...current, grants: [] }))
      toast({ title: t('settings.mcp_revoked_count', { count: result.revoked }), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const createKey = async () => {
    if (displayOnly || !info?.enabled || busyRef.current) return
    const name = keyName.trim()
    if (!name) {
      toast({ title: t('settings.mcp_api_key_name_required'), tone: 'danger' })
      return
    }
    if (!begin('keyCreate')) return
    try {
      const result = await api.mcp.createKey(name)
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          apiKeys: [result.key, ...current.apiKeys],
        }))
        setKeyName('')
        setNewToken(result.token)
      }
      toast({ title: t('settings.mcp_api_key_created'), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const revokeKey = async (id: string, name: string) => {
    const approved = await confirm({
      title: t('settings.mcp_api_key_revoke_title'),
      description: t('settings.mcp_api_key_revoke_desc', { name }),
      confirmLabel: t('settings.mcp_api_key_revoke'),
      tone: 'danger',
    })
    if (!approved || !begin('keyRevoke')) return
    try {
      await api.mcp.revokeKey(id)
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          apiKeys: current.apiKeys.filter((key) => key.id !== id),
        }))
      }
      toast({ title: t('settings.mcp_api_key_revoked'), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const toggleAiSearch = async (enabled: boolean) => {
    if (!begin('aiSearch')) return
    try {
      const status = await api.mcp.aiSearch.save(enabled)
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          aiSearch: status,
        }))
      }
      toast({ title: enabled ? t('settings.mcp_ai_search_enabled') : t('settings.mcp_ai_search_disabled'), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const reindexAi = async () => {
    const approved = await confirm({
      title: t('settings.mcp_ai_search_reindex_title'),
      description: t('settings.mcp_ai_search_reindex_desc'),
      confirmLabel: t('settings.mcp_ai_search_reindex'),
    })
    if (!approved || !begin('aiReindex')) return
    try {
      const result = await api.mcp.aiSearch.reindex()
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          aiSearch: result,
        }))
      }
      toast({ title: t('settings.mcp_ai_search_reindexed', { count: result.enqueued }), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const clearAi = async () => {
    const approved = await confirm({
      title: t('settings.mcp_ai_search_clear_title'),
      description: t('settings.mcp_ai_search_clear_desc'),
      confirmLabel: t('settings.mcp_ai_search_clear'),
      tone: 'danger',
    })
    if (!approved || !begin('aiClear')) return
    try {
      const result = await api.mcp.aiSearch.clear()
      if (mountedRef.current) {
        setInfo((current) => current && ({
          ...current,
          aiSearch: { ...current.aiSearch, indexedCount: 0, pendingCount: 0 },
        }))
      }
      toast({ title: t('settings.mcp_ai_search_cleared', { count: result.removed }), tone: 'success' })
    } catch (error) {
      fail(error)
    } finally {
      finish()
    }
  }

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      window.setTimeout(() => {
        if (mountedRef.current) setCopied((current) => current === id ? null : current)
      }, 1_800)
      toast({ title: t('settings.mcp_copied'), tone: 'success' })
    } catch (error) {
      fail(error)
    }
  }

  const snippets = useMemo(() => info ? clientSnippets(info) : [], [info])

  return {
displayOnly,
info,
isLoading,
loadError,
busy,
copied,
keyName,
setKeyName,
newToken,
setNewToken,
load,
savePreference,
revoke,
revokeAll,
createKey,
revokeKey,
toggleAiSearch,
reindexAi,
clearAi,
copy,
snippets,
  };
}
