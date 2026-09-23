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

const API_FILE_URL = /^\/api\/kanban\/file\/([^/]+)\/([^/]+)$/
const R2_FILE_KEY = /^kanban\/([^/]+)\/(.+)$/

// Past notes keep whatever prefix their upload got, so a delete is addressed by
// the file's own stored location rather than by the board's current namespace.
export function kanbanFileLocation(file: { url?: string; r2Key?: string }): { kanbanName: string; filename: string } | null {
  const fromUrl = API_FILE_URL.exec(file.url ?? '')
  if (fromUrl) return { kanbanName: fromUrl[1]!, filename: fromUrl[2]! }
  const fromKey = R2_FILE_KEY.exec(file.r2Key ?? '')
  if (fromKey) return { kanbanName: fromKey[1]!, filename: fromKey[2]! }
  return null
}
