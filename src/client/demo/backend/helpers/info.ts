import { APP_VERSION } from '@shared/constants'
import type { McpSettingsInfo, SessionInfo } from '@shared/types'
import type { DemoState } from '../../state'

export function demoMcpSettings(now = Date.now()): McpSettingsInfo {
  return {
    enabled: true,
    canManageGlobal: true,
    endpoint: 'https://your-inkstone.example/mcp',
    oauth: true,
    preferences: {
      writeEnabled: true,
      trashEnabled: false,
      updatedAt: now - 24 * 60 * 60 * 1000,
    },
    apiKeys: [{
      id: 'demo-api-key',
      name: 'Automation key',
      scopes: ['notes:read', 'notes:write'],
      createdAt: now - 14 * 24 * 60 * 60 * 1000,
      lastUsedAt: now - 18 * 60 * 1000,
    }],
    aiSearch: {
      available: true,
      enabled: true,
      model: '@cf/baai/bge-m3',
      indexedCount: 24,
      pendingCount: 2,
      reason: null,
    },
    grants: [{
      id: 'demo-grant',
      clientId: 'demo-desktop-client',
      clientName: 'Desktop MCP client',
      clientUri: 'https://example.com',
      scopes: ['notes:read', 'notes:write'],
      createdAt: now - 7 * 24 * 60 * 60 * 1000,
      expiresAt: null,
    }],
    privacy: {
      publicEndpoint: false,
      perUserIndex: true,
      externalClientReceivesSelectedContent: true,
    },
  }
}

export function siteInfo(state: DemoState) {
  return {
    name: 'Inkstone Demo',
    initialized: true,
    registrationOpen: state.registrationOpen,
    r2Enabled: false,
    kvEnabled: false,
    attachmentStorage: null,
    realtimeEnabled: false,
    version: APP_VERSION,
  } as const
}

export function sessionInfo(state: DemoState): SessionInfo {
  return {
    user: state.authenticated ? state.user : null,
    site: siteInfo(state),
    settings: state.authenticated ? state.settings : null,
  }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json()
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(details === undefined ? {} : { details }) } }),
    { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  )
}

