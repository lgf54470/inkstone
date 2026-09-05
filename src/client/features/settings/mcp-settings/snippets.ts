import { t } from '../../../lib/i18n';
import type { McpSettingsInfo } from '@shared/types';

export function clientSnippets(info: McpSettingsInfo): Array<{ id: string; name: string; value: string }> {
  const scopes = [
    'notes:read',
    ...(info.preferences.writeEnabled ? ['notes:write'] : []),
    ...(info.preferences.trashEnabled ? ['notes:trash'] : []),
  ]
  const scopeText = scopes.join(' ')
  const endpoint = info.endpoint
  const claudeJson = JSON.stringify({
    type: 'http',
    url: endpoint,
    oauth: { scopes: scopeText },
  })
  const bearerJson = JSON.stringify({
    type: 'http',
    url: endpoint,
    headers: { Authorization: 'Bearer <API_KEY>' },
  })
  return [
    {
      id: 'codex',
      name: 'Codex',
      value: `codex mcp add inkstone --url "${endpoint}"`,
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      value: `claude mcp add-json inkstone '${claudeJson}' --scope user\nclaude mcp login inkstone`,
    },
    {
      id: 'hermes',
      name: 'Hermes Agent',
      value: `hermes mcp add inkstone --url "${endpoint}" --auth oauth\nhermes mcp login inkstone`,
    },
    {
      id: 'openclaw',
      name: 'OpenClaw',
      value: `openclaw mcp add inkstone --url "${endpoint}" --transport streamable-http --auth oauth --oauth-scope "${scopeText}"\nopenclaw mcp login inkstone`,
    },
    {
      id: 'generic',
      name: t('settings.mcp_generic_client'),
      value: t('settings.mcp_generic_client_snippet', { endpoint, bearerJson }),
    },
  ]
}

export function scopeSummary(scopes: string[]): string {
  return scopes.map((scope) => {
    if (scope === 'notes:read') return t('settings.mcp_scope_read')
    if (scope === 'notes:write') return t('settings.mcp_scope_write')
    if (scope === 'notes:trash') return t('settings.mcp_scope_trash')
    return scope
  }).join(' · ')
}
