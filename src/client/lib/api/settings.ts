import type { McpAiSearchStatus, McpApiKey, McpSettingsInfo, UpdateCheckResponse, UserSettings } from '@shared/types';
import { publishBroadcast } from '../db';
import { CLIENT_ID, request } from './transport';
export const settings = {
  settings: {
    get: () => request<UserSettings>('/api/settings'),
    save: async (body: Partial<UserSettings>) => {
      const settings = await request<UserSettings>('/api/settings', { method: 'PUT', body })
      publishBroadcast({ type: 'settings-changed', clientId: CLIENT_ID })
      return settings
    },
    stats: () => request<Record<string, number>>('/api/settings/stats'),
  },
  mcp: {
    get: () => request<McpSettingsInfo>('/api/mcp'),
    save: (body: {
      enabled?: boolean
      writeEnabled?: boolean
      trashEnabled?: boolean
    }) => request<{
      enabled: boolean
      preferences: McpSettingsInfo['preferences']
      reconnectRequired: boolean
    }>('/api/mcp', { method: 'PUT', body }),
    revokeGrant: (id: string) => request<{ ok: true }>(`/api/mcp/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    revokeAllGrants: () => request<{ ok: true; revoked: number }>('/api/mcp/grants/revoke-all', { method: 'POST' }),
    createKey: (name: string) =>
      request<{ key: McpApiKey; token: string }>('/api/mcp/keys', { method: 'POST', body: { name } }),
    revokeKey: (id: string) =>
      request<{ ok: true }>(`/api/mcp/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    aiSearch: {
      save: (enabled: boolean) =>
        request<McpAiSearchStatus>('/api/mcp/ai-search', { method: 'PUT', body: { enabled } }),
      reindex: () =>
        request<McpAiSearchStatus & { ok: true; enqueued: number }>('/api/mcp/ai-search/reindex', { method: 'POST' }),
      clear: () =>
        request<{ ok: true; removed: number }>('/api/mcp/ai-search/clear', { method: 'POST' }),
    },
  },
  update: {
    check: () => request<UpdateCheckResponse>('/api/update', { timeoutMs: 10_000 }),
  },
}

