export type BackupTargetType = 'webdav' | 's3'

export type BackupMode = 'archive' | 'mirror'

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  mode: BackupMode
}

export interface WebdavConfig {
  url: string
  username: string
  prefix: string
  mode: BackupMode
}

export type BackupTargetConfig = S3Config | WebdavConfig

export interface BackupTarget {
  id: string
  type: BackupTargetType
  name: string
  enabled: boolean
  config: BackupTargetConfig
  hasSecret: boolean
  lastRunAt: number | null
  lastStatus: 'success' | 'failed' | null
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface BackupTargetInput {
  type: BackupTargetType
  name: string
  enabled?: boolean
  config: Partial<S3Config> & Partial<WebdavConfig>

  secret?: {
    password?: string
    accessKeyId?: string
    secretAccessKey?: string
  }
}

export type BackupTargetPatchInput = Partial<BackupTargetInput> & {
  expectedUpdatedAt?: number
}

export interface BackupTargetResult {
  targetId: string
  targetName: string
  targetType: BackupTargetType
  ok: boolean
  files: number
  bytes: number
  ms: number
  error: string | null
}

export interface BackupRun {
  id: string
  trigger: 'manual' | 'cron'
  status: 'running' | 'success' | 'partial' | 'failed'
  startedAt: number
  finishedAt: number | null
  noteCount: number
  fileCount: number
  bytes: number
  results: BackupTargetResult[]
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  detail?: string
  latencyMs?: number
}
