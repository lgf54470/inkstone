/**
 * What may be used as a link or an image source.
 *
 * The blog takes URLs from readers — a friend-link application, a comment author's own site and
 * picture — and renders them inside the admin session, so the data arrives from a place the app does
 * not control. `javascript:` in an `href` and a `data:` document in an `<img>` are the two forms that
 * turn that data into code; a scheme allowlist closes both, and a renderer that refuses to make an
 * unsafe value clickable is what covers rows stored before the rule existed.
 *
 * Three shapes are allowed: `http(s):`, `mailto:` for a link, and a site-relative path. Everything
 * else is refused, including a protocol-relative `//host/path`, which names a host but no scheme.
 */

const CONTROL_CHARACTERS = /[\u0000-\u0020\u007f]/g
const SCHEME = /^([a-z][a-z0-9+.-]*):/i

export type ExternalUrlKind = 'link' | 'image'

export function isSafeExternalUrl(value: string | null | undefined, kind: ExternalUrlKind = 'link'): boolean {
  const raw = (value ?? '').trim()
  if (!raw) return false
  // The scheme is read with ASCII control characters removed, for the reason a browser removes them:
  // `java\tscript:alert(1)` is the `javascript:` URL it renders as, so judging the raw string would
  // allow exactly the form the allowlist exists to refuse.
  const probe = raw.replace(CONTROL_CHARACTERS, '')
  const scheme = SCHEME.exec(probe)
  if (!scheme) return !probe.startsWith('//')
  const name = scheme[1]!.toLowerCase()
  if (name === 'http' || name === 'https') return true
  return kind === 'link' && name === 'mailto'
}

/**
 * The value when it may be used as a link or image source, otherwise null so the caller renders it as
 * text instead of as an affordance. Returning the original string (trimmed) rather than a rebuilt URL
 * keeps a site-relative path exactly as the author wrote it.
 */
export function safeExternalUrl(value: string | null | undefined, kind: ExternalUrlKind = 'link'): string | null {
  const raw = (value ?? '').trim()
  return isSafeExternalUrl(raw, kind) ? raw : null
}
