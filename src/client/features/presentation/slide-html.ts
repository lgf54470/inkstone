import { renderMarkdown, type RenderResult } from '../../lib/markdown/renderer'

// Enhanced per-slide markup keyed by content fingerprint + theme + slide index,
// so a remount (e.g. across fullscreen toggles) reuses the last good html instead
// of resetting diagrams to their loading placeholders. The slide list renders the
// same cache, which is why the key is derived here instead of inside the canvas.
const slideHtmlCache = new Map<string, string>()
const SLIDE_HTML_CACHE_LIMIT = 60

export function hashContent(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index++) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  return `${value.length}:${(hash >>> 0).toString(36)}`
}

export function slideCacheKey(fingerprint: string, dark: boolean, index: number): string {
  return `${fingerprint}:${dark ? 'd' : 'l'}:${index}`
}

export function readSlideHtml(key: string): string | undefined {
  return slideHtmlCache.get(key)
}

export function rememberSlideHtml(key: string, html: string): void {
  slideHtmlCache.delete(key)
  slideHtmlCache.set(key, html)
  while (slideHtmlCache.size > SLIDE_HTML_CACHE_LIMIT) {
    const oldest = slideHtmlCache.keys().next().value
    if (oldest === undefined) break
    slideHtmlCache.delete(oldest)
  }
}

// The un-enhanced render is both the thumbnail source and the first paint of a
// slide canvas, before diagrams finish rendering into the cache.
export function renderSlideSource(source: string, externalImages: boolean): RenderResult {
  return renderMarkdown(source, { externalImages, hideFrontMatter: true })
}
