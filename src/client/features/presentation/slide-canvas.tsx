import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useSession } from '../../store/session'
import { destroyChartInstances, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useIsDarkTheme } from './presentation-theme'
import { readSlideHtml, renderSlideSource } from './slide-html'
import { planSlidePages, resolvePageIndex, samePlan, type SlideBlock, type SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_Y, type StageMetrics } from './slide-stage'

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
}

// The design canvas is laid out at its design size and scaled, so the slide image
// matches the stage box exactly and the browser does the scaling on the compositor.
export function SlideViewport({ metrics, cacheKey, source, subPage, onPlan }: { metrics: StageMetrics } & Omit<SlideCanvasProps, 'contentWidth' | 'contentHeight'>) {
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
      />
    </div>
  )
}

export function SlideCanvas({ cacheKey, source, subPage, contentWidth, contentHeight, onPlan }: SlideCanvasProps) {
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const preview = useSession((s) => s.settings.preview)
  const dark = useIsDarkTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const fallbackHtml = useMemo(
    () => renderSlideSource(source, preview.externalImages).html,
    [source, preview.externalImages],
  )
  const html = readSlideHtml(cacheKey) ?? fallbackHtml
  const [renderVersion, setRenderVersion] = useState(0)
  const markDiagramsRendered = useCallback(() => setRenderVersion((version) => version + 1), [])
  const { plan, measured } = useSlideLayout(hostRef, html, subPage, contentWidth, contentHeight, renderVersion)
  useSlideDiagrams(hostRef, html, dark, markDiagramsRendered)
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

  return (
    <div className='ink-slide relative h-full w-full overflow-hidden'>
      <div className='absolute inset-x-0' style={{ top: SLIDE_PAD_Y, transform: `translateY(-${page?.top ?? 0}px)` }}>
        <SlideProse html={html} contentWidth={contentWidth} font={proseFont} hostRef={hostRef} />
      </div>
    </div>
  )
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
function useSlideDiagrams(hostRef: RefObject<HTMLDivElement | null>, html: string, dark: boolean, onRendered: () => void): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const render = async () => {
      await renderPendingMermaid(host, dark)
      if (cancelled) return
      await renderChartJs(host, dark)
      if (!cancelled) onRendered()
    }
    void render().catch((error: unknown) => {
      console.warn('[inkstone] slide diagram rendering failed', error)
    })
    return () => {
      cancelled = true
      destroyChartInstances(host)
    }
  }, [html, dark, hostRef, onRendered])
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
