import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useSession } from '../../store/session'
import { destroyChartInstances, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useIsDarkTheme } from './presentation-theme'
import { readSlideHtml, renderSlideSource } from './slide-html'
import { planSlidePages, resolvePageIndex, type SlideBlock, type SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_Y, type StageMetrics } from './slide-stage'

const HEADING_TAG = /^H[1-6]$/

export interface SlideCanvasProps {
  cacheKey: string
  source: string
  subPage: number
  contentWidth: number
  contentHeight: number
  onPageCount: (count: number) => void
}

// The design canvas is laid out at its design size and scaled, so the slide image
// matches the stage box exactly and the browser does the scaling on the compositor.
export function SlideViewport({ metrics, cacheKey, source, subPage, onPageCount }: { metrics: StageMetrics } & Omit<SlideCanvasProps, 'contentWidth' | 'contentHeight'>) {
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
        onPageCount={onPageCount}
      />
    </div>
  )
}

export function SlideCanvas({ cacheKey, source, subPage, contentWidth, contentHeight, onPageCount }: SlideCanvasProps) {
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
  const plan = useSlideLayout(hostRef, html, subPage, contentWidth, contentHeight, renderVersion)
  useSlideDiagrams(hostRef, html, dark, markDiagramsRendered)
  useFontLoadedMeasure(markDiagramsRendered)
  useEffect(() => {
    onPageCount(plan.pages.length)
  }, [plan, onPageCount])
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
function useSlideLayout(hostRef: RefObject<HTMLDivElement | null>, html: string, subPage: number, contentWidth: number, contentHeight: number, renderVersion: number): SlidePlan {
  const [plan, setPlan] = useState<SlidePlan>(() => planSlidePages([], contentHeight))
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
      setPlan((current) => (samePlan(current, next) ? current : next))
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
    applySlidePage([...host.children] as HTMLElement[], plan, subPage, contentWidth, contentHeight)
  }, [hostRef, plan, subPage, contentWidth, contentHeight])
  return plan
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

function samePlan(a: SlidePlan, b: SlidePlan): boolean {
  if (a.pages.length !== b.pages.length || a.scales.length !== b.scales.length) return false
  return a.pages.every((page, index) => {
    const other = b.pages[index]
    return Boolean(other) && page.from === other.from && page.to === other.to && page.top === other.top
  }) && a.scales.every((scale, index) => scale === b.scales[index])
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
