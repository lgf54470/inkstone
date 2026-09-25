/**
 * Protocol whitelist for URLs that come from kanban fence content. Fence JSON is
 * user-authored (and arrives via shares/imports), so covers and file urls are
 * rendered from data we do not trust.
 */

// `blob:` stays because the demo backend answers kanban uploads with object
// urls (`demo/backend/routes/files.ts` → `browserFileUrl`): a blob url is
// runtime-created, origin-scoped and unforgeable by a fence author, and it is
// session-local, so it can never point at anything the writer did not just
// upload. `kanbanFileLocation` below still rejects it, so it buys no delete or
// read path — it is a render whitelist, not an authority grant.
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
  return null
}

/**
 * A cover is the one URL field the browser never follows — it is drawn as an `<img src>`, where a
 * data url carries the pixels and any script inside it cannot run. A file's url, by contrast, is a
 * link the reader can press and a body the panel can fetch, so it keeps the stricter list; a cover
 * may additionally be an inline image.
 */
export function safeKanbanCoverUrl(raw: string | undefined): string | null {
  const shared = safeKanbanUrl(raw)
  if (shared !== null) return shared
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value.toLowerCase().startsWith('data:image/')) return null
  try {
    return new URL(value).protocol === 'data:' ? value : null
  } catch {
    return null
  }
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
