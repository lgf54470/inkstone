import type { BackupMode, BackupTarget, BackupTargetConfig, BackupTargetInput } from '@shared/types'
import { newDemoId } from '../../state'

export function createBackupTarget(input: BackupTargetInput): BackupTarget {
  const now = Date.now()
  const type = input.type
  const config = demoBackupConfig(input)
  return {
    id: newDemoId(),
    type,
    name: input.name.trim(),
    enabled: input.enabled ?? true,
    config,
    hasSecret: hasDemoBackupSecret(type, input.secret),
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function demoBackupConfig(input: BackupTargetInput): BackupTargetConfig {
  const mode: BackupMode = input.config.mode === 'mirror' ? 'mirror' : 'archive'
  return input.type === 's3'
    ? {
        endpoint: input.config.endpoint ?? '',
        region: input.config.region ?? 'auto',
        bucket: input.config.bucket ?? '',
        prefix: input.config.prefix ?? '',
        pathStyle: input.config.pathStyle ?? true,
        mode,
      }
    : {
        url: input.config.url ?? '',
        username: input.config.username ?? '',
        prefix: input.config.prefix ?? '',
        mode,
      }
}

export function demoBackupTargetError(input: BackupTargetInput, requireSecret: boolean): string | null {
  if (input.type !== 's3' && input.type !== 'webdav') return 'type must be s3 or webdav'
  if (typeof input.name !== 'string' || !input.name.trim()) return 'Enter a name'
  if (input.name.trim().length > 120) return 'The name must not exceed 120 characters'
  if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) {
    return 'config must be an object'
  }
  if (input.type === 's3') {
    if (typeof input.config.bucket !== 'string' || !input.config.bucket.trim()) {
      return 'Enter a bucket name'
    }
    if (requireSecret && !hasDemoBackupSecret('s3', input.secret)) {
      return 'Enter an Access Key and Secret Key'
    }
    return null
  }
  if (typeof input.config.url !== 'string' || !input.config.url.trim()) return 'Enter a WebDAV URL'
  if (typeof input.config.username !== 'string' || !input.config.username.trim()) return 'Enter a username'
  if (requireSecret && !hasDemoBackupSecret('webdav', input.secret)) return 'Enter a password'
  return null
}

export function hasDemoBackupSecret(
  type: BackupTargetInput['type'],
  secret: BackupTargetInput['secret'],
): boolean {
  if (type === 's3') {
    return Boolean(secret?.accessKeyId?.trim() && secret.secretAccessKey?.trim())
  }
  return Boolean(secret?.password?.trim())
}

