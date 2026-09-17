/**
 * What an embed may put on a slide. `view` is artwork the file carries, which is drawn; `url`
 * is an address, which is offered as a link and never loaded in place — a note is not a viewer
 * for arbitrary pages, and a live frame in a note runs someone else's script under the note's
 * own origin. The decision is a pure function so the renderer, a test and (later) validation
 * all answer it the same way.
 */
export function embedViewIsInline(view?: string): boolean {
  const value = (view ?? '').trim()
  if (!value || !value.startsWith('<')) return false
  return /^<(svg|div|span|section|figure|img|picture|table|ul|ol|p)\b/i.test(value)
}

/** An address a link may point at: a web address or a path inside the app. */
export function embedUrlIsSafe(url?: string): boolean {
  const value = (url ?? '').trim()
  if (!value) return false
  if (value.startsWith('//')) return true
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  return /^https?:/i.test(value)
}

/** The address an embed shows, or the empty string when it carries none worth offering. */
export function embedUrl(url?: string): string {
  return embedUrlIsSafe(url) ? (url ?? '').trim() : ''
}
