import { renderMarkdown, type RenderResult } from '../../lib/markdown/renderer'
import { resolvePageIndex, type SlidePlan } from './slide-pagination'

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

// One page of a measured slide, as markup. The canvas shows a page by translating
// the whole slide and hiding the rest, which is what chart.js needs to measure its
// canvas; a thumbnail only has to look right, so it gets just the page's own blocks
// and skips the geometry — that keeps a 14-page slide from mounting 14 full copies
// of its markup in the slide list. Blocks a page had to shrink keep their factor.
export function slicePageHtml(html: string, plan: SlidePlan, subPage: number, contentWidth: number, contentHeight: number): string {
  const page = plan.pages[resolvePageIndex(plan, subPage)]
  if (!page) return html
  const template = document.createElement('template')
  template.innerHTML = html
  const children = [...template.content.children]
  const kept = children.slice(page.from, page.to)
  kept.forEach((child, offset) => {
    // The canvas hides off-page blocks with an inline `visibility`; a thumbnail must not
    // inherit that from the markup it sliced out of, and owns its own layout anyway.
    if (child instanceof HTMLElement) child.style.visibility = ''
    applySliceScale(child, plan.scales[page.from + offset] ?? 1, contentWidth, contentHeight)
  })
  return kept.map((child) => child.outerHTML).join('')
}

function applySliceScale(child: Element, scale: number, contentWidth: number, contentHeight: number): void {
  if (scale >= 1 || !(child instanceof HTMLElement)) return
  child.style.transformOrigin = 'top left'
  child.style.transform = `scale(${scale})`
  child.style.width = `${contentWidth / scale}px`
  child.style.height = `${contentHeight / scale}px`
  child.style.overflow = 'hidden'
}
