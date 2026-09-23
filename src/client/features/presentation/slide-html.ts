import { renderMarkdown, type RenderResult } from '../../lib/markdown/renderer'
import type { FenceBodies } from '../../lib/markdown/fence-bodies'
import { resolvePageIndex, type SlidePlan } from './slide-pagination'

/**
 * A slide's prepared markup with the fence bodies it was rendered from (P-01).
 *
 * The two travel together because a serialized slide is re-enhanced downstream: the printed deck
 * runs the snapshot renderers over the pages it is handed, and a `kanban` block there reads its
 * board back out of the set, not out of its own attributes. Markup cached without its bodies prints
 * those blocks as empty fences.
 */
export interface SlideMarkup {
  html: string
  fences: FenceBodies
}

// Enhanced per-slide markup keyed by content fingerprint + theme + slide index,
// so a remount (e.g. across fullscreen toggles) reuses the last good html instead
// of resetting diagrams to their loading placeholders. The slide list renders the
// same cache, which is why the key is derived here instead of inside the canvas.
const slideHtmlCache = new Map<string, SlideMarkup>()
const SLIDE_HTML_CACHE_LIMIT = 60
const slideHtmlListeners = new Set<() => void>()

export function hashContent(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index++) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  return `${value.length}:${(hash >>> 0).toString(36)}`
}

/**
 * The content box is part of the key because a diagram is drawn for it: a slide
 * prepared for a laptop's stage and the same slide prepared for a projector draw
 * their mind maps at different sizes, and reusing one for the other would show a
 * picture measured for a box that is no longer the one on screen.
 */
export function slideCacheKey(options: { fingerprint: string; dark: boolean; index: number; contentWidth: number; contentHeight: number }): string {
  const { fingerprint, dark, index, contentWidth, contentHeight } = options
  return `${fingerprint}:${dark ? 'd' : 'l'}:${index}:${Math.round(contentWidth)}x${Math.round(contentHeight)}`
}

export function readSlideHtml(key: string): SlideMarkup | undefined {
  return slideHtmlCache.get(key)
}

/** The entry a plain render makes, for a slide whose prepared markup never landed in the cache. */
export function slideMarkup(rendered: RenderResult): SlideMarkup {
  return { html: rendered.html, fences: rendered.fences }
}

export function rememberSlideHtml(key: string, markup: SlideMarkup): void {
  slideHtmlCache.delete(key)
  slideHtmlCache.set(key, markup)
  while (slideHtmlCache.size > SLIDE_HTML_CACHE_LIMIT) {
    const oldest = slideHtmlCache.keys().next().value
    if (oldest === undefined) break
    slideHtmlCache.delete(oldest)
  }
  for (const listener of slideHtmlListeners) listener()
}

// Readers that render from the cache subscribe to it: a slide's markup is written several
// times (the plain render, then the enhanced one, then a canvas's diagram-bearing capture),
// and a reader that only looked once would keep the placeholder it saw first.
export function subscribeSlideHtml(listener: () => void): () => void {
  slideHtmlListeners.add(listener)
  return () => {
    slideHtmlListeners.delete(listener)
  }
}

// What the measuring canvas captured for a slide, as markup for the cache. The capture is a
// source other surfaces render from again — the projector, the slide list, the printed deck — so
// it has to be as re-renderable as the markup it came from. A chart is the one block that is not:
// its instance and its canvas pixels cannot be serialized, so the clone gets a still of what was
// on screen (a chart picture for the list and the printed page) and no "already rendered" marker
// (a still is not a chart), which is what makes the projector draw a live one on its own canvas.
// A diagram's SVG does survive serialization, and its marker is what lets the cached copy be
// hydrated instead of re-rendered, so that one is left alone.
export function captureSlideHtml(host: HTMLElement | null): string | null {
  const page = host?.querySelector<HTMLElement>('[data-slide-page]')
  if (!page) return null
  const clone = page.cloneNode(true) as HTMLElement
  const live = page.querySelectorAll<HTMLElement>('[data-chart]')
  // Both trees come from the same markup, so their chart blocks line up by their walking order.
  clone.querySelectorAll<HTMLElement>('[data-chart]').forEach((block, index) => {
    const source = live[index]
    if (source) freezeChart(block, source)
  })
  return clone.innerHTML
}

// A clone's canvas has no pixels — `cloneNode` copies the element, not the drawing — so the still
// comes from the live canvas and replaces the clone's canvas in place.
function freezeChart(block: HTMLElement, source: HTMLElement): void {
  const canvas = source.querySelector('canvas')
  delete block.dataset.rendered
  if (!canvas) return
  try {
    const still = document.createElement('img')
    still.className = 'chartjs-still'
    still.alt = ''
    still.src = canvas.toDataURL('image/png')
    const target = block.querySelector('canvas')
    if (target) target.replaceWith(still)
    else block.appendChild(still)
  }
  catch (error: unknown) {
    // Best-effort: a canvas chart.js drew a cross-origin image into cannot be read back, and its
    // block still renders live on the projector — only the list and the printed page lose the
    // picture for that one chart.
    console.warn('[inkstone] chart capture failed', error)
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
