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
} from 'lucide-react';
import { type McpSettingsInfo } from '@shared/types';
import { LoadingBlock } from '../../../components/feedback';
import { Input, SettingRow, Switch } from '../../../components/form';
import { Tooltip } from '../../../components/overlay';
import { Badge, Button, IconButton } from '../../../components/primitives';
import { t } from '../../../lib/i18n';
import { fullTime, relativeTime } from '../../../lib/time';
import { scopeSummary } from './snippets';
import { useMcpSettings, type McpSettingsState } from './use-mcp-settings';

type McpReady = Omit<McpSettingsState, 'info'> & { info: McpSettingsInfo };

export function McpSettings() {
  const m = useMcpSettings();
  if (m.isLoading && !m.info) return <LoadingBlock label={t('settings.mcp_loading')} />;
  if (!m.info) {
    return <McpLoadError message={m.loadError ?? t('settings.mcp_load_failed')} onRetry={() => void m.load()} />;
  }
  const v: McpReady = { ...m, info: m.info };
  return (
    <div className="space-y-6">
      {v.displayOnly && <McpDemoBanner />}
      <EndpointCard v={v} />
      <PermissionsSection v={v} />
      <KeysSection v={v} />
      <AiSearchSection v={v} />
      <ConnectSection v={v} />
      <ClientsSection v={v} />
      <McpPrivacyNote />
    </div>
  );
}

function McpLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
      <p className="text-[length:var(--text-12\.5)] text-[var(--danger)]">{message}</p>
      <Button className="mt-3" size="sm" icon={<RefreshCw size={12} />} onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function McpDemoBanner() {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div>
          <h3 className="text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{t('settings.mcp_demo_title')}</h3>
          <p className="mt-1 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">{t('settings.mcp_demo_desc')}</p>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 px-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
      {children}
    </h3>
  );
}

function EndpointCard({ v }: { v: McpReady }) {
  return (
    <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 rounded-[var(--r-md)] bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
          <Bot size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[length:var(--text-13\.5)] font-semibold text-[var(--text-primary)]">{t('settings.mcp_private_knowledge')}</h3>
            <Badge tone={v.info.enabled ? 'success' : 'neutral'}>
              {v.info.enabled ? t('settings.enabled') : t('settings.mcp_disabled')}
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
            {v.info.endpoint}
          </code>
          <Tooltip label={t('settings.mcp_copy')} side="left">
            <IconButton label={t('settings.mcp_copy')} size="sm" disabled={v.displayOnly} onClick={() => void v.copy('endpoint', v.info.endpoint)}>
              {v.copied === 'endpoint' ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          </Tooltip>
        </div>
        <p className="mt-2 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-quaternary)]">
          {t('settings.mcp_endpoint_desc')}
        </p>
      </div>
    </section>
  );
}

function PermissionsSection({ v }: { v: McpReady }) {
  const disabled = v.displayOnly || !v.info.enabled || Boolean(v.busy);
  const rows = [
    ...(v.info.canManageGlobal ? [{
      id: 'global' as const,
      title: t('settings.mcp_enable'),
      description: t('settings.mcp_enable_desc'),
      checked: v.info.enabled,
      disabled: v.displayOnly || Boolean(v.busy),
      onChange: (enabled: boolean) => void v.savePreference('global', { enabled }),
    }] : []),
    {
      id: 'write' as const,
      title: t('settings.mcp_write_access'),
      description: t('settings.mcp_write_access_desc'),
      checked: v.info.preferences.writeEnabled,
      disabled,
      onChange: (writeEnabled: boolean) => void v.savePreference('write', { writeEnabled }),
    },
    {
      id: 'trash' as const,
      title: t('settings.mcp_trash_access'),
      description: t('settings.mcp_trash_access_desc'),
      checked: v.info.preferences.trashEnabled,
      disabled,
      onChange: (trashEnabled: boolean) => void v.savePreference('trash', { trashEnabled }),
    },
  ];
  return (
    <section>
      <SectionHeading>{t('settings.mcp_permissions')}</SectionHeading>
      {rows.map((row) => (
        <SettingRow key={row.id} title={row.title} description={row.description}>
          <Switch
            checked={row.checked}
            disabled={row.disabled}
            label={row.title}
            onChange={(value) => void row.onChange(value)}
          />
        </SettingRow>
      ))}
    </section>
  );
}

function KeysSection({ v }: { v: McpReady }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
        {t('settings.mcp_api_keys')}
      </h3>
      <p className="mb-3 px-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
        {t('settings.mcp_api_keys_desc')}
      </p>
      {v.newToken && <NewTokenCard v={v} />}
      <KeyCreateRow v={v} />
      <ApiKeyList v={v} />
    </section>
  );
}

function NewTokenCard({ v }: { v: McpReady }) {
  return (
    <div className="mb-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--text-11)] font-medium text-[var(--text-primary)]">
        <KeyRound size={12} className="text-[var(--accent)]" />
        {t('settings.mcp_api_key_copy_warning')}
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-[var(--r-sm)] bg-[var(--bg-base)] px-2.5 py-2 font-mono text-[length:var(--text-11)] text-[var(--text-secondary)]">
          {v.newToken}
        </code>
        <Button size="sm" variant="secondary" icon={v.copied === 'new-token' ? <Check size={12} /> : <Copy size={12} />}
          onClick={() => void v.copy('new-token', v.newToken as string)}>
          {v.copied === 'new-token' ? t('common.copied') : t('common.copy')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => v.setNewToken(null)}>{t('common.close')}</Button>
      </div>
      <p className="mt-1.5 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{t('settings.mcp_api_key_show_once')}</p>
    </div>
  );
}

function KeyCreateRow({ v }: { v: McpReady }) {
  const disabled = v.displayOnly || !v.info.enabled || Boolean(v.busy);
  return (
    <div className="mb-2 flex items-center gap-2">
      <Input
        value={v.keyName}
        disabled={disabled}
        aria-label={t('settings.mcp_api_key_name')}
        onChange={(e) => v.setKeyName(e.target.value)}
        maxLength={80}
        placeholder={t('settings.mcp_api_key_name_placeholder')}
        onKeyDown={(e) => { if (e.key === 'Enter') void v.createKey() }}
      />
      <Button variant="secondary" icon={<KeyRound size={13} />} loading={v.busy === 'keyCreate'}
        disabled={v.displayOnly || Boolean(v.busy) || !v.info.enabled} onClick={() => void v.createKey()}>
        {t('settings.mcp_api_key_create')}
      </Button>
    </div>
  );
}

function ApiKeyList({ v }: { v: McpReady }) {
  const keys = v.info.apiKeys;
  if (!keys.length) return <EmptyState text={t('settings.mcp_api_keys_empty')} />;
  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      {keys.map((key) => <ApiKeyRow key={key.id} v={v} id={key.id} name={key.name} scopes={key.scopes} lastUsedAt={key.lastUsedAt} createdAt={key.createdAt} />)}
    </div>
  );
}

function ApiKeyRow({ v, id, name, scopes, lastUsedAt, createdAt }: {
  v: McpReady;
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: number | null;
  createdAt: number;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-3.5 last:border-b-0">
      <span className="rounded-[var(--r-sm)] bg-[var(--bg-raised)] p-2 text-[var(--text-tertiary)]">
        <KeyRound size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{name}</div>
        <div className="mt-0.5 truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
          {scopeSummary(scopes)}
          {' · '}
          {lastUsedAt
            ? t('settings.mcp_api_key_used', { time: relativeTime(lastUsedAt) })
            : t('settings.mcp_api_key_unused')}
          {' · '}{t('settings.mcp_granted_at', { time: fullTime(createdAt) })}
        </div>
      </div>
      <Tooltip label={t('settings.mcp_api_key_revoke')} side="left">
        <IconButton
          label={t('settings.mcp_api_key_revoke')}
          size="sm"
          disabled={v.displayOnly || Boolean(v.busy)}
          onClick={() => void v.revokeKey(id, name)}
        >
          <Trash2 size={14} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function AiSearchSection({ v }: { v: McpReady }) {
  return (
    <section>
      <AiSearchHeader v={v} />
      <AiSearchBody v={v} />
    </section>
  );
}

function AiSearchHeader({ v }: { v: McpReady }) {
  const aiSearch = v.info.aiSearch;
  return (
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
        disabled={v.displayOnly || !v.info.enabled || !aiSearch.available || Boolean(v.busy)}
        label={t('settings.mcp_ai_search')}
        onChange={(enabled) => void v.toggleAiSearch(enabled)}
      />
    </div>
  );
}

function AiSearchBody({ v }: { v: McpReady }) {
  const aiSearch = v.info.aiSearch;
  return (
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
        <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />} loading={v.busy === 'aiReindex'}
          disabled={v.displayOnly || !aiSearch.enabled || Boolean(v.busy)} onClick={() => void v.reindexAi()}>
          {t('settings.mcp_ai_search_reindex')}
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} loading={v.busy === 'aiClear'}
          disabled={v.displayOnly || Boolean(v.busy)} onClick={() => void v.clearAi()}>
          {t('settings.mcp_ai_search_clear')}
        </Button>
      </div>
    </div>
  );
}

function ConnectSection({ v }: { v: McpReady }) {
  return (
    <section>
      <SectionHeading>{t('settings.mcp_connect_clients')}</SectionHeading>
      <p className="mb-3 px-1 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">
        {t('settings.mcp_connect_desc')}
      </p>
      <div className="space-y-2">
        {v.snippets.map((snippet) => <SnippetRow key={snippet.id} v={v} snippet={snippet} />)}
      </div>
    </section>
  );
}

function SnippetRow({ v, snippet }: { v: McpReady; snippet: { id: string; name: string; value: string } }) {
  return (
    <details className="group overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">
        <span>{snippet.name}</span>
        <span className="text-[length:var(--text-10\.5)] font-normal text-[var(--text-quaternary)]">{t('settings.mcp_transport')}</span>
      </summary>
      <div className="border-t border-[var(--border-subtle)] p-3">
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--r-sm)] bg-[var(--bg-inset)] p-2.5 text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-secondary)]">{snippet.value}</pre>
          <Tooltip label={t('settings.mcp_copy')} side="left">
            <IconButton label={t('settings.mcp_copy')} size="sm" disabled={v.displayOnly} onClick={() => void v.copy(snippet.id, snippet.value)}>
              {v.copied === snippet.id ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </details>
  );
}

function ClientsSection({ v }: { v: McpReady }) {
  const grants = v.info.grants;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h3 className="text-[length:var(--text-11)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t('settings.mcp_connected_clients')}
        </h3>
        {grants.length > 1 && (
          <Button size="sm" variant="ghost" disabled={v.displayOnly || Boolean(v.busy)} onClick={() => void v.revokeAll()}>
            {t('settings.mcp_revoke_all')}
          </Button>
        )}
      </div>
      {grants.length ? (
        <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
          {grants.map((grant) => <ClientRow key={grant.id} v={v} clientName={grant.clientName} scopes={grant.scopes} createdAt={grant.createdAt} revoke={() => void v.revoke(grant)} />)}
        </div>
      ) : (
        <EmptyState text={t('settings.mcp_no_clients')} />
      )}
    </section>
  );
}

function ClientRow({ v, clientName, scopes, createdAt, revoke }: {
  v: McpReady;
  clientName: string;
  scopes: string[];
  createdAt: number;
  revoke: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-3.5 last:border-b-0">
      <span className="rounded-[var(--r-sm)] bg-[var(--bg-raised)] p-2 text-[var(--text-tertiary)]">
        <ShieldCheck size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{clientName}</div>
        <div className="mt-0.5 truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
          {scopeSummary(scopes)} · {t('settings.mcp_granted_at', { time: fullTime(createdAt) })}
        </div>
      </div>
      <Tooltip label={t('settings.mcp_revoke')} side="left">
        <IconButton
          label={t('settings.mcp_revoke')}
          size="sm"
          disabled={v.displayOnly || Boolean(v.busy)}
          onClick={revoke}
        >
          <Unplug size={14} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-5 text-center text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">
      {text}
    </div>
  );
}

function McpPrivacyNote() {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--success)]" />
        <div>
          <h3 className="text-[length:var(--text-12\.5)] font-medium text-[var(--text-primary)]">{t('settings.mcp_privacy')}</h3>
          <p className="mt-1 text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)]">{t('settings.mcp_privacy_desc')}</p>
        </div>
      </div>
    </section>
  );
}
