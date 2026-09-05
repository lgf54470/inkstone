import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
} from 'lucide-react'
import { LoadingBlock } from '../../../components/feedback'
import { Input, SettingRow, Switch } from '../../../components/form'
import { Tooltip } from '../../../components/overlay'
import { Badge, Button, IconButton } from '../../../components/primitives'
import { t } from '../../../lib/i18n'
import { fullTime, relativeTime } from '../../../lib/time'
import { scopeSummary } from './snippets'
import { useMcpSettings } from './use-mcp-settings'

export function McpSettings() {
  const {
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
  } = useMcpSettings();

  if (isLoading && !info) return <LoadingBlock label={t('settings.mcp_loading')} />
  if (!info) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
        <p className="text-[length:var(--text-12\.5)] text-[var(--danger)]">{loadError ?? t('settings.mcp_load_failed')}</p>
        <Button className="mt-3" size="sm" icon={<RefreshCw size={12} />} onClick={() => void load()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  const preferences = info.preferences
  const aiSearch = info.aiSearch

  return (
    <div className="space-y-6">
      {displayOnly && (
        <section className="rounded-[var(--r-lg)] border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <h3 className="text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{t('settings.mcp_demo_title')}</h3>
              <p className="mt-1 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">{t('settings.mcp_demo_desc')}</p>
            </div>
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
        <div className="flex items-start gap-3 p-4">
          <span className="mt-0.5 rounded-[var(--r-md)] bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
            <Bot size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[length:var(--text-13\.5)] font-semibold text-[var(--text-primary)]">{t('settings.mcp_private_knowledge')}</h3>
              <Badge tone={info.enabled ? 'success' : 'neutral'}>
                {info.enabled ? t('settings.enabled') : t('settings.mcp_disabled')}
              </Badge>
            </div>
            <p className="mt-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
              {t('settings.mcp_intro')}
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <div className="mb-1 text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]">{t('settings.mcp_endpoint')}</div>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-2.5 py-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)]">
              {info.endpoint}
            </code>
            <Tooltip label={t('settings.mcp_copy')} side="left">
              <IconButton label={t('settings.mcp_copy')} size="sm" disabled={displayOnly} onClick={() => void copy('endpoint', info.endpoint)}>
                {copied === 'endpoint' ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            </Tooltip>
          </div>
          <p className="mt-2 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-quaternary)]">
            {t('settings.mcp_endpoint_desc')}
          </p>
        </div>
      </section>

      <section>
        <h3 className="mb-1 px-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t('settings.mcp_permissions')}
        </h3>
        {info.canManageGlobal && (
          <SettingRow title={t('settings.mcp_enable')} description={t('settings.mcp_enable_desc')}>
            <Switch
              checked={info.enabled}
              disabled={displayOnly || Boolean(busy)}
              label={t('settings.mcp_enable')}
              onChange={(enabled) => void savePreference('global', { enabled })}
            />
          </SettingRow>
        )}
        <SettingRow title={t('settings.mcp_write_access')} description={t('settings.mcp_write_access_desc')}>
          <Switch
            checked={preferences.writeEnabled}
            disabled={displayOnly || !info.enabled || Boolean(busy)}
            label={t('settings.mcp_write_access')}
            onChange={(writeEnabled) => void savePreference('write', { writeEnabled })}
          />
        </SettingRow>
        <SettingRow title={t('settings.mcp_trash_access')} description={t('settings.mcp_trash_access_desc')}>
          <Switch
            checked={preferences.trashEnabled}
            disabled={displayOnly || !info.enabled || Boolean(busy)}
            label={t('settings.mcp_trash_access')}
            onChange={(trashEnabled) => void savePreference('trash', { trashEnabled })}
          />
        </SettingRow>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t('settings.mcp_api_keys')}
        </h3>
        <p className="mb-3 px-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
          {t('settings.mcp_api_keys_desc')}
        </p>

        {newToken && (
          <div className="mb-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--text-11)] font-medium text-[var(--text-primary)]">
              <KeyRound size={12} className="text-[var(--accent)]" />
              {t('settings.mcp_api_key_copy_warning')}
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-[var(--r-sm)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[length:var(--text-11)] text-[var(--text-secondary)]">
                {newToken}
              </code>
              <Button size="sm" variant="secondary" icon={copied === 'new-token' ? <Check size={12} /> : <Copy size={12} />}
                onClick={() => void copy('new-token', newToken)}>
                {copied === 'new-token' ? t('common.copied') : t('common.copy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>{t('common.close')}</Button>
            </div>
            <p className="mt-1.5 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{t('settings.mcp_api_key_show_once')}</p>
          </div>
        )}

        <div className="mb-2 flex items-center gap-2">
          <Input
            value={keyName}
            disabled={displayOnly || !info.enabled || Boolean(busy)}
            aria-label={t('settings.mcp_api_key_name')}
            onChange={(e) => setKeyName(e.target.value)}
            maxLength={80}
            placeholder={t('settings.mcp_api_key_name_placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') void createKey() }}
          />
          <Button variant="secondary" icon={<KeyRound size={13} />} loading={busy === 'keyCreate'}
            disabled={displayOnly || Boolean(busy) || !info.enabled} onClick={() => void createKey()}>
            {t('settings.mcp_api_key_create')}
          </Button>
        </div>

        {info.apiKeys.length ? (
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
            {info.apiKeys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-3.5 last:border-b-0">
                <span className="rounded-[var(--r-sm)] bg-[var(--bg-raised)] p-2 text-[var(--text-tertiary)]">
                  <KeyRound size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{key.name}</div>
                  <div className="mt-0.5 truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
                    {scopeSummary(key.scopes)}
                    {' · '}
                    {key.lastUsedAt
                      ? t('settings.mcp_api_key_used', { time: relativeTime(key.lastUsedAt) })
                      : t('settings.mcp_api_key_unused')}
                    {' · '}{t('settings.mcp_granted_at', { time: fullTime(key.createdAt) })}
                  </div>
                </div>
                <Tooltip label={t('settings.mcp_api_key_revoke')} side="left">
                  <IconButton
                    label={t('settings.mcp_api_key_revoke')}
                    size="sm"
                    disabled={displayOnly || Boolean(busy)}
                    onClick={() => void revokeKey(key.id, key.name)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Tooltip>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-5 text-center text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">
            {t('settings.mcp_api_keys_empty')}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-[var(--accent)]" />
            <h3 className="text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
              {t('settings.mcp_ai_search')}
            </h3>
            {aiSearch.available ? (
              <Badge tone={aiSearch.enabled ? 'success' : 'neutral'}>
                {aiSearch.enabled ? t('settings.enabled') : t('settings.mcp_disabled')}
              </Badge>
            ) : (
              <Badge tone="warning">{t('settings.mcp_ai_search_unavailable')}</Badge>
            )}
          </div>
          <Switch
            checked={aiSearch.enabled}
            disabled={displayOnly || !info.enabled || !aiSearch.available || Boolean(busy)}
            label={t('settings.mcp_ai_search')}
            onChange={(enabled) => void toggleAiSearch(enabled)}
          />
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3.5">
          <p className="text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
            {t('settings.mcp_ai_search_desc')}
          </p>
          {aiSearch.available ? (
            <p className="mt-2 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
              {t('settings.mcp_ai_search_indexed', { count: aiSearch.indexedCount })}
              {aiSearch.pendingCount > 0 && ` · ${t('settings.mcp_ai_search_pending', { count: aiSearch.pendingCount })}`}
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[length:var(--text-10\.5)] text-[var(--danger)]">
              <AlertTriangle size={12} />
              {t('settings.mcp_ai_search_unavailable_desc')}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} loading={busy === 'aiReindex'}
              disabled={displayOnly || !aiSearch.enabled || Boolean(busy)} onClick={() => void reindexAi()}>
              {t('settings.mcp_ai_search_reindex')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} loading={busy === 'aiClear'}
              disabled={displayOnly || Boolean(busy)} onClick={() => void clearAi()}>
              {t('settings.mcp_ai_search_clear')}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t('settings.mcp_connect_clients')}
        </h3>
        <p className="mb-3 px-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
          {t('settings.mcp_connect_desc')}
        </p>
        <div className="space-y-2">
          {snippets.map((snippet) => (
            <details key={snippet.id} className="group overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">
                <span>{snippet.name}</span>
                <span className="text-[length:var(--text-10\.5)] font-normal text-[var(--text-quaternary)]">{t('settings.mcp_transport')}</span>
              </summary>
              <div className="border-t border-[var(--border-subtle)] p-3">
                <div className="flex items-start gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-2.5 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-secondary)]">{snippet.value}</pre>
                  <Tooltip label={t('settings.mcp_copy')} side="left">
                    <IconButton label={t('settings.mcp_copy')} size="sm" disabled={displayOnly} onClick={() => void copy(snippet.id, snippet.value)}>
                      {copied === snippet.id ? <Check size={14} /> : <Copy size={14} />}
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
            {t('settings.mcp_connected_clients')}
          </h3>
          {info.grants.length > 1 && (
            <Button size="sm" variant="ghost" disabled={displayOnly || Boolean(busy)} onClick={() => void revokeAll()}>
              {t('settings.mcp_revoke_all')}
            </Button>
          )}
        </div>
        {info.grants.length ? (
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
            {info.grants.map((grant) => (
              <div key={grant.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-3.5 last:border-b-0">
                <span className="rounded-[var(--r-sm)] bg-[var(--bg-raised)] p-2 text-[var(--text-tertiary)]">
                  <ShieldCheck size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{grant.clientName}</div>
                  <div className="mt-0.5 truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
                    {scopeSummary(grant.scopes)} · {t('settings.mcp_granted_at', { time: fullTime(grant.createdAt) })}
                  </div>
                </div>
                <Tooltip label={t('settings.mcp_revoke')} side="left">
                  <IconButton
                    label={t('settings.mcp_revoke')}
                    size="sm"
                    disabled={displayOnly || Boolean(busy)}
                    onClick={() => void revoke(grant)}
                  >
                    <Unplug size={14} />
                  </IconButton>
                </Tooltip>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-5 text-center text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">
            {t('settings.mcp_no_clients')}
          </div>
        )}
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--success)]" />
          <div>
            <h3 className="text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{t('settings.mcp_privacy')}</h3>
            <p className="mt-1 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">{t('settings.mcp_privacy_desc')}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
