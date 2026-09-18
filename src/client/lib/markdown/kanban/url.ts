/**
 * Protocol whitelist for URLs that come from kanban fence content. Fence JSON is
 * user-authored (and arrives via shares/imports), so covers and file urls are
 * rendered from data we do not trust.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])

export function safeKanbanUrl(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value === '') return null
  // A leading slash is same-site; '//' would be a protocol-relative external request.
  if (value.startsWith('/') && !value.startsWith('//')) return value
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (ALLOWED_PROTOCOLS.has(parsed.protocol)) return value
  if (parsed.protocol === 'data:' && parsed.href.startsWith('data:image/')) return value
  return null
}
