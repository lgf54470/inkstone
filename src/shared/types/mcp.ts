export interface McpPreferences {
  writeEnabled: boolean
  trashEnabled: boolean
  updatedAt: number
}

export interface McpGrant {
  id: string
  clientId: string
  clientName: string
  clientUri: string | null
  scopes: string[]
  createdAt: number
  expiresAt: number | null
}

export interface McpApiKey {
  id: string
  name: string
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
}

export interface McpAiSearchStatus {
  available: boolean
  enabled: boolean
  model: string
  indexedCount: number
  pendingCount: number
  reason: 'no_ai_binding' | null
}

export interface McpSettingsInfo {
  enabled: boolean
  canManageGlobal: boolean
  endpoint: string
  oauth: true
  preferences: McpPreferences
  apiKeys: McpApiKey[]
  aiSearch: McpAiSearchStatus
  grants: McpGrant[]
  privacy: {
    publicEndpoint: false
    perUserIndex: true
    externalClientReceivesSelectedContent: true
  }
}
