import { prefersReducedMotion } from '../../motion'
import type { MediaElement } from './types'

/**
 * What a media element is allowed to point at. A deck's body is untrusted input, and a
 * media source is a URL a browser will fetch or a data: URI it will decode, so the rule is
 * the same one the SVG gate uses: bytes the file itself carries, or a plain web address.
 * `javascript:`, `file:` and friends never become a source, and a data: URI only counts
 * when its own media type is media — `data:text/html` is a document, not a clip.
 */
export function mediaSrcIsSafe(src: string): boolean {
  const value = src.trim()
  if (!value) return false
  if (/^data:(image|video|audio)\//i.test(value)) return true
  if (/^data:/i.test(value)) return false
  // No scheme at all is a relative or root-relative path, which resolves inside the app.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  return /^https?:/i.test(value)
}

/**
 * The address a media element actually loads: `asset:<key>` names bytes in the document's
 * own table, everything else is the source as written. An asset key with no entry resolves
 * to the empty string so the caller paints a frame that says so, rather than a `<video>`
 * that silently plays nothing.
 */
export function resolveMediaSrc(src: string, assets?: Record<string, string>): string {
  if (!src) return ''
  if (src.startsWith('asset:')) return assets?.[src.slice('asset:'.length)] ?? ''
  return mediaSrcIsSafe(src) ? src : ''
}

/**
 * Whether a clip starts itself. Reduced motion wins over the document: a deck asking for
 * autoplay is a request, and the reader's system preference is the answer. Browsers only
 * start an unmuted clip on their own, which is why the caller mutes an autoplaying element.
 */
export function mediaAutoplays(el: MediaElement, reducedMotion = prefersReducedMotion()): boolean {
  return el.autoplay === true && !reducedMotion
}

export function mediaFit(el: MediaElement): 'cover' | 'contain' | 'fill' {
  return el.fit === 'contain' || el.fit === 'fill' ? el.fit : 'cover'
}
