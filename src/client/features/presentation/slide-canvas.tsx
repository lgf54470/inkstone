import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { useSession } from '../../store/session'
import { destroyChartInstances, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useIsDarkTheme } from './presentation-theme'
import { readSlideHtml, renderSlideSource, subscribeSlideHtml } from './slide-html'
import { planSlidePages, resolvePageIndex, samePlan, type SlideBlock, type SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_Y, type StageMetrics } from './slide-stage'
import { registerFenceBodies, type FenceBodies } from '../../lib/markdown/fence-bodies'
import {
  markSlidesReady,
  parseSlidesBody,
  showSlidesError,
  slidesBlocks,
  slidesBody,
  slidesPlaceholder,
  type BentoDoc,
} from '../../lib/markdown/slides'
import { interceptSlideLink } from './presentation-state'

const HEADING_TAG = /^H[1-6]$/

export interface SlideCanvasProps {
  cacheKey: string
  source: string
  subPage: number
  contentWidth: number
  contentHeight: number
  /**
   * The measured plan, shared with the show so the slide list can list this
   * slide's pages and the counter can name them. The canvas is the only place a
   * plan is measured because it renders the same markup the projector shows.
   */
  onPlan: (plan: SlidePlan) => void
  /**
   * Whether charts are drawn with their entrance animation. Off by default, because the projector's
   * canvas is looked at. The measuring pass turns it on: it is invisible, and its markup is captured
   * for the slide list — the capture reads the canvas, and chart.js draws its first frame on a later
   * one, so a pass that captured an animated chart shipped a picture of nothing (measured: 0 of
   * 51604 pixels drawn at capture, the whole chart after the animation).
   */
  instantCharts?: boolean
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The design canvas is laid out at its design size and scaled, so the slide image
// matches the stage box exactly and the browser does the scaling on the compositor.
export function SlideViewport({ metrics, cacheKey, source, subPage, onPlan, instantCharts }: { metrics: StageMetrics } & Omit<SlideCanvasProps, 'contentWidth' | 'contentHeight'>) {
  return (
    <div
      data-slide-canvas
      className='shrink-0 overflow-hidden bg-[var(--bg-editor)]'
      style={{ width: metrics.designWidth, height: metrics.designHeight, transform: `scale(${metrics.scale})` }}
    >
      <SlideCanvas
        cacheKey={cacheKey}
        source={source}
        subPage={subPage}
        contentWidth={metrics.contentWidth}
        contentHeight={metrics.contentHeight}
        onPlan={onPlan}
        instantCharts={instantCharts}
      />
    </div>
  )
}

export function SlideCanvas({ cacheKey, source, subPage, contentWidth, contentHeight, onPlan, instantCharts = false }: SlideCanvasProps) {
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const preview = useSession((s) => s.settings.preview)
  const dark = useIsDarkTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const prepared = useSyncExternalStore(subscribeSlideHtml, () => readSlideHtml(cacheKey))
  // The cache is the prepared markup for this slide; the plain render only exists to cover the
  // first paint before it lands. Rendering it unconditionally would double the markdown work of
  // every slide the measuring pass walks — the pass has just prepared that slide, so the cache
  // hits and the plain render is pure waste in the middle of a talk.
  const fallbackRender = useMemo(
    () => renderSlideSource(source, preview.externalImages),
    [source, preview.externalImages],
  )
  const html = prepared?.html ?? fallbackRender.html
  const fences = prepared?.fences ?? fallbackRender.fences
  const [renderVersion, setRenderVersion] = useState(0)
  const markDiagramsRendered = useCallback(() => setRenderVersion((version) => version + 1), [])
  const { plan, measured } = useSlideLayout(hostRef, html, subPage, contentWidth, contentHeight, renderVersion)
  const prefersMotion = prefersReducedMotion()
  const effectiveInstantCharts = instantCharts || prefersMotion
  useSlideDiagrams(hostRef, html, dark, markDiagramsRendered, effectiveInstantCharts)
  useBentoSlidesFallback(hostRef, html, fences, markDiagramsRendered)
  useFontLoadedMeasure(markDiagramsRendered)
  // Only a measurement of the markup on screen is published. The canvas is reused when
  // the show moves to another slide, so its state still holds the previous slide's plan
  // for the first commit: reporting that would tell the show — and the slide list — that
  // the new slide has as many pages as the old one, and the show clamps the presenter's
  // page against that number, which bounced a click on page 2 back to page 1.
  // A rendered diagram bumps the version, and that report matters too: the deck-measuring
  // pass captures the canvas's markup for the slide list, and the capture has to be the one
  // taken after the diagrams are in place, or the list shows their loading placeholders.
  useEffect(() => {
    if (measured) onPlan(plan)
  }, [measured, plan, renderVersion, onPlan])
  const page = plan.pages[resolvePageIndex(plan, subPage)]

  const handleLinkClick = useSlideLinkInterceptor()

  return (
    <div className='ink-slide relative h-full w-full overflow-hidden' onClick={handleLinkClick}>
      <div className='absolute inset-x-0' style={{ top: SLIDE_PAD_Y, transform: `translateY(-${page?.top ?? 0}px)` }}>
        <SlideProse html={html} contentWidth={contentWidth} font={proseFont} hostRef={hostRef} />
      </div>
    </div>
  )
}

function useSlideLinkInterceptor() {
  return useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    if (!anchor) return
    event.preventDefault()
    event.stopPropagation()
    interceptSlideLink(anchor.getAttribute('href'), (url, target, features) => window.open(url, target, features))
  }, [])
}

// Measuring and applying happen in the same pass, because an out-of-plan block
// must never survive a re-measure that produced the same plan: the ResizeObserver
// re-runs after every style write, and a plan-diffed effect would skip restoring
// the shrink the reset step just cleared.
function useSlideLayout(hostRef: RefObject<HTMLDivElement | null>, html: string, subPage: number, contentWidth: number, contentHeight: number, renderVersion: number): { plan: SlidePlan; measured: boolean } {
  // The plan is stored next to the markup it was measured from, so a plan that
  // describes a slide the canvas no longer shows is never handed out as current.
  const [layout, setLayout] = useState<{ html: string; plan: SlidePlan } | null>(null)
  const placeholder = useMemo(() => planSlidePages([], contentHeight), [contentHeight])
  const subPageRef = useRef(subPage)
  subPageRef.current = subPage
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const measure = () => {
      const children = [...host.children] as HTMLElement[]
      resetBlockFit(children)
      const blocks: SlideBlock[] = children.map((child) => ({
        top: child.offsetTop,
        height: child.offsetHeight,
        heading: HEADING_TAG.test(child.tagName),
      }))
      const next = planSlidePages(blocks, contentHeight)
      applySlidePage(children, next, subPageRef.current, contentWidth, contentHeight)
      setLayout((current) => (current?.html === html && samePlan(current.plan, next) ? current : { html, plan: next }))
    }
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [hostRef, html, contentWidth, contentHeight, renderVersion])
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    applySlidePage([...host.children] as HTMLElement[], layout?.html === html ? layout.plan : placeholder, subPage, contentWidth, contentHeight)
  }, [hostRef, layout, html, placeholder, subPage, contentWidth, contentHeight])
  const current = layout?.html === html
  return { plan: current ? layout.plan : placeholder, measured: current }
}

function resetBlockFit(children: HTMLElement[]): void {
  for (const child of children) {
    child.style.transform = ''
    child.style.transformOrigin = ''
    child.style.width = ''
    child.style.height = ''
    child.style.overflow = ''
  }
}

// Off-page blocks hide via visibility rather than display, so chart.js never
// re-measures a diagram when the page changes; an oversized block is scaled down
// so its whole content stays visible instead of being clipped or scrolled.
function applySlidePage(children: HTMLElement[], plan: SlidePlan, subPage: number, contentWidth: number, contentHeight: number): void {
  const page = plan.pages[resolvePageIndex(plan, subPage)]
  children.forEach((child, index) => {
    child.style.visibility = !page || (index >= page.from && index < page.to) ? '' : 'hidden'
    const scale = plan.scales[index] ?? 1
    if (scale >= 1) {
      child.style.transform = ''
      child.style.transformOrigin = ''
      child.style.width = ''
      child.style.height = ''
      child.style.overflow = ''
      return
    }
    child.style.transformOrigin = 'top left'
    child.style.transform = `scale(${scale})`
    child.style.width = `${contentWidth / scale}px`
    child.style.height = `${contentHeight / scale}px`
    child.style.overflow = 'hidden'
  })
}

// Diagrams are rendered once per committed markup and theme, exactly like the
// editor preview does: an observer-driven re-render would fire on the diagram's
// own DOM writes and re-render them forever, and every pagination re-measure
// would then see the leftover placeholders instead of the diagram's real height.
function useSlideDiagrams(hostRef: RefObject<HTMLDivElement | null>, html: string, dark: boolean, onRendered: () => void, instantCharts: boolean): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const render = async () => {
      await renderPendingMermaid(host, dark)
      if (cancelled) return
      await renderChartJs(host, dark, { instant: instantCharts })
      if (!cancelled) onRendered()
    }
    void render().catch((error: unknown) => {
      console.warn('[inkstone] slide diagram rendering failed', error)
    })
    return () => {
      cancelled = true
      destroyChartInstances(host)
    }
  }, [html, dark, hostRef, onRendered, instantCharts])
}

function useFontLoadedMeasure(onLoaded: () => void): void {
  useEffect(() => {
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) onLoaded()
    })
    return () => {
      cancelled = true
    }
  }, [onLoaded])
}

function renderBentoSlidesFallback(block: HTMLElement, data: BentoDoc): void {
  const placeholder = slidesPlaceholder(block) ?? block
  const container = document.createElement('div')
  container.className =
    'bento-slides-fallback-grid grid grid-cols-2 gap-[var(--sp-2)] p-[var(--sp-2)] bg-[var(--bg-inset)] rounded-[var(--radius-md)]'
  for (const slide of data.slides) {
    const card = document.createElement('div')
    card.className =
      'bento-slides-fallback-card border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-[var(--sp-2)] rounded-[var(--radius-sm)] flex flex-col gap-[var(--sp-1)]'
    if (slide.title) {
      const titleEl = document.createElement('div')
      titleEl.className = 'font-semibold text-[length:var(--text-14)] text-[var(--text-primary)] truncate'
      titleEl.textContent = slide.title
      card.appendChild(titleEl)
    }
    const snippet = slide.elements
      ?.filter((el) => el.type === 'text' && 'html' in el && typeof (el as { html?: unknown }).html === 'string')
      .map((el) => (el as { html: string }).html.replace(/<[^>]+>/g, '').trim())
      .filter((text): text is string => Boolean(text && text !== slide.title))
      .slice(0, 2)
      .join(' · ')
    if (snippet) {
      const textEl = document.createElement('div')
      textEl.className = 'text-[length:var(--text-12)] text-[var(--text-secondary)] line-clamp-2'
      textEl.textContent = snippet
      card.appendChild(textEl)
    }
    container.appendChild(card)
  }
  placeholder.replaceChildren(container)
}

export function useBentoSlidesFallback(
  hostRef: RefObject<HTMLDivElement | null>,
  html: string,
  fences?: FenceBodies,
  onRendered?: () => void,
): void {
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (fences) registerFenceBodies(host, fences)
    const blocks = slidesBlocks(host)
    if (blocks.length === 0) return
    let changed = false
    for (const block of blocks) {
      if (block.classList.contains('is-ready')) continue
      const raw = slidesBody(block)
      const parsed = parseSlidesBody(raw)
      if (parsed.ok) {
        renderBentoSlidesFallback(block, parsed.data)
        markSlidesReady(block)
        changed = true
      } else {
        showSlidesError(block, parsed.error)
        changed = true
      }
    }
    if (changed && onRendered) onRendered()
  }, [hostRef, html, fences, onRendered])
}
