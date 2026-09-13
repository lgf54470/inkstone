import { isUnsafeHostname } from '../lib/outbound-url'




export class BackupConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupConfigError'
  }
}

export function parseBackupEndpoint(rawValue: string, label: string): URL {
  const raw = rawValue.trim()
  if (!raw) throw new BackupConfigError(`Enter ${label}`)
  const candidate = hasScheme(raw) ? raw : `https://${raw}`
  if (hasRawPathTraversal(candidate)) {
    throw new BackupConfigError(`${label} path cannot contain . or .. segments`)
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new BackupConfigError(`${label} has an invalid format`)
  }

  if (url.protocol !== 'https:') {
    throw new BackupConfigError(`${label} must use HTTPS`)
  }
  if (url.username || url.password) {
    throw new BackupConfigError(`${label} cannot include a username or password in the URL`)
  }
  if (url.search || url.hash) {
    throw new BackupConfigError(`${label} cannot include a query or fragment`)
  }
  if (isUnsafeHostname(url.hostname)) {
    throw new BackupConfigError(`${label} cannot point to localhost, private, or reserved addresses`)
  }
  if (hasTraversalSegment(url.pathname)) {
    throw new BackupConfigError(`${label} path cannot contain . or .. segments`)
  }
  return url
}

export function normalizeBackupPrefix(value: string): string {
  const prefix = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  validateBackupPrefix(prefix)
  return prefix
}


function validateBackupPrefix(value: string): void {
  if (!value) return
  for (const rawSegment of value.replace(/\\/g, '/').split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      throw new BackupConfigError('Path prefix contains invalid escaping')
    }
    if (!segment || segment === '.' || segment === '..') {
      throw new BackupConfigError('Path prefix cannot contain empty, . or .. segments')
    }
    if (/\p{Cc}/u.test(segment)) {
      throw new BackupConfigError('Path prefix cannot contain control characters')
    }
  }
}

export function normalizeS3Region(value: string | undefined): string {
  const region = value?.trim() || 'auto'
  if (region !== 'auto' && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(region)) {
    throw new BackupConfigError('Region has an invalid format')
  }
  return region
}

export function validateS3Bucket(bucketValue: string, pathStyle: boolean): string {
  const bucket = bucketValue.trim()
  if (!bucket) throw new BackupConfigError('Enter a bucket name')
  const valid = pathStyle
    ? /^[A-Za-z0-9][A-Za-z0-9._-]{0,253}[A-Za-z0-9]$/.test(bucket) ||
      /^[A-Za-z0-9]$/.test(bucket)
    : /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
      !bucket.includes('..') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(bucket)
  if (!valid) {
    throw new BackupConfigError(
      pathStyle
        ? 'Bucket names may contain only letters, numbers, dots, underscores, and hyphens'
        : 'A virtual-hosted bucket must be a 3-63 character lowercase DNS name',
    )
  }
  return bucket
}

function hasScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
}

function hasTraversalSegment(pathname: string): boolean {
  return pathname.split('/').some((raw) => {
    if (!raw) return false
    try {
      const value = decodeURIComponent(raw)
      return value === '.' || value === '..' || value.includes('/') || value.includes('\\')
    } catch {
      return true
    }
  })
}

function hasRawPathTraversal(value: string): boolean {
  const authority = value.indexOf('//')
  const pathStart = authority >= 0 ? value.indexOf('/', authority + 2) : value.indexOf('/')
  if (pathStart < 0) return false
  const query = value.indexOf('?', pathStart)
  const hash = value.indexOf('#', pathStart)
  const ends = [query, hash].filter((position) => position >= 0)
  const pathEnd = ends.length ? Math.min(...ends) : value.length
  return hasTraversalSegment(value.slice(pathStart, pathEnd))
}
