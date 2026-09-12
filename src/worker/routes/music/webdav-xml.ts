export interface WebdavPropfindEntry {
  href: string
  isCollection: boolean
  sizeBytes: number
  mime: string | null
  modifiedAt: number | null
}

const RESPONSE_RE = /<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi
const HREF_RE = /<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href>/i
const COLLECTION_RE = /<(?:[\w.-]+:)?collection\b[^>]*\/?>/i
const LENGTH_RE = /<(?:[\w.-]+:)?getcontentlength\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getcontentlength>/i
const TYPE_RE = /<(?:[\w.-]+:)?getcontenttype\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getcontenttype>/i
const MODIFIED_RE = /<(?:[\w.-]+:)?getlastmodified\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?getlastmodified>/i
const MAX_ENTRIES = 2000

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .trim()
}

function parseModified(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseMultistatus(xml: string): WebdavPropfindEntry[] {
  const entries: WebdavPropfindEntry[] = []
  RESPONSE_RE.lastIndex = 0
  let match = RESPONSE_RE.exec(xml)
  while (match && entries.length < MAX_ENTRIES) {
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
    match = RESPONSE_RE.exec(xml)
  }
  return entries
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

export function isAudioEntry(entry: WebdavPropfindEntry): boolean {
  if (entry.isCollection) return true
  if (entry.mime && /^audio\//i.test(entry.mime)) return true
  return /\.(mp3|m4a|flac|wav|ogg|oga|opus|aac|webm)$/i.test(entry.href)
}
