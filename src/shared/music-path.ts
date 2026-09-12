const SEGMENT_RE = /^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u

export function normalizeMusicDir(value: unknown, fallback = 'music'): string {
  if (typeof value !== 'string') return fallback
  const segments = value
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..' && SEGMENT_RE.test(segment))
  const joined = segments.join('/').replace(/\s+/g, ' ').slice(0, 120).replace(/^\/+|\/+$/g, '')
  return joined || fallback
}

export function musicRemotePath(dir: string, relative: string): string | null {
  const base = normalizeMusicDir(dir)
  const clean = relative
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (clean.some((segment) => segment === '.' || segment === '..' || segment.includes('\\'))) return null
  return [base, ...clean].join('/')
}
