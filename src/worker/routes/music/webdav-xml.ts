export interface WebdavPropfindEntry {
  href: string
  isCollection: boolean
  sizeBytes: number
  mime: string | null
  modifiedAt: number | null
}

// truncated is true when the entry cap stopped parsing before the document ended.
export interface WebdavPropfindResult {
  entries: WebdavPropfindEntry[]
  truncated: boolean
}

const RESPONSE_RE = /<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi
const HREF_RE = /<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href>/i
const COLLECTION_RE = /<(?:[\w.-]+:)?collection\b[^>]*\/?>/i
const LENGTH_RE = /<(?:[\w.-]+:)?getcontentlength\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getcontentlength>/i
const TYPE_RE = /<(?:[\w.-]+:)?getcontenttype\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getcontenttype>/i
const MODIFIED_RE = /<(?:[\w.-]+:)?getlastmodified\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getlastmodified>/i
const MAX_ENTRIES = 2000
const MAX_CODE_POINT = 0x10ff_ff

function decodeNumericEntity(raw: string, code: string): string {
  const value = Number(code)
  // A server-side typo must not 500 the whole listing: an entity outside the
  // Unicode range is kept verbatim instead of throwing in fromCodePoint.
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_CODE_POINT ? String.fromCodePoint(value) : raw
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, decodeNumericEntity)
    .replace(/&amp;/g, '&')
    .trim()
}

function parseModified(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseMultistatus(xml: string): WebdavPropfindResult {
  const entries: WebdavPropfindEntry[] = []
  RESPONSE_RE.lastIndex = 0
  let match = RESPONSE_RE.exec(xml)
  while (match && entries.length < MAX_ENTRIES) {
    try {
      const block = match[1] ?? ''
      const href = HREF_RE.exec(block)?.[1]
      if (href) {
        const modified = MODIFIED_RE.exec(block)?.[1]
        entries.push({
          href: decodeXmlText(href),
          isCollection: COLLECTION_RE.test(block),
          sizeBytes: Number(LENGTH_RE.exec(block)?.[1] ?? 0) || 0,
          mime: TYPE_RE.exec(block)?.[1] ? decodeXmlText(TYPE_RE.exec(block)![1]!) : null,
          modifiedAt: modified ? parseModified(decodeXmlText(modified)) : null,
        })
      }
    } catch (error) {
      // Boundary defence for third-party XML: one broken response block is
      // skipped with a warning instead of failing the whole listing.
      console.warn('[inkstone] webdav multistatus entry skipped:', error)
    }
    match = RESPONSE_RE.exec(xml)
  }
  // A leftover match means the cap stopped the loop with responses still unparsed.
  return { entries, truncated: match !== null }
}

export function decodeHrefPath(href: string): string {
  const withoutOrigin = href.startsWith('http://') || href.startsWith('https://')
    ? new URL(href).pathname
    : href.split(/[?#]/)[0] ?? href
  const segments = withoutOrigin.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  return segments.join('/')
}

// The remote listing is only useful as far as it shows what can actually be
// imported, and the import resolver accepts exactly this set of containers.
export function isMediaEntry(entry: WebdavPropfindEntry): boolean {
  if (entry.isCollection) return true
  if (entry.mime && /^(?:audio|video)\//i.test(entry.mime)) return true
  return /\.(mp3|m4a|mp4|flac|wav|wave|ogg|oga|opus|aac|webm|mov|m4v)$/i.test(entry.href)
}
