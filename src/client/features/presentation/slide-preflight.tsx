import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nextUnmeasuredSlide } from './presentation-state'
import { useIsDarkTheme } from './presentation-theme'
import { SlideCanvas } from './slide-canvas'
import { readSlideHtml, rememberSlideHtml } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'
import { useSlideHtml } from './use-slide-html'

// A page count can only come from measuring the projector's own markup, with diagrams
// in place: measuring the sidebar's copy would read the loading placeholders and
// under-count the pages. So while a show is open the whole deck is measured once, one
// slide per idle slice, in an off-screen canvas that runs the same component and the
// same pipeline as the stage. The measured plan goes to the slide list (so it lists
// every page from the start) and the rendered markup goes back to the html cache (so
// the projector's later visit is a cache hit instead of a second render).
const STALL_MS = 4_000
const IDLE_FALLBACK_MS = 60
const IDLE_TIMEOUT_MS = 600

export interface SlidePreflightProps {
  deck: string[]
  cacheKeys: string[]
  fingerprint: string
  metrics: StageMetrics
  plans: Record<number, SlidePlan>
  content: string
  noteTitle: string
  onPlan: (slide: number, plan: SlidePlan) => void
}

export function SlidePreflight({ deck, cacheKeys, fingerprint, metrics, plans, content, noteTitle, onPlan }: SlidePreflightProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const dark = useIsDarkTheme()
  const { cursor, report } = usePreflightPass({ deckLength: deck.length, fingerprint, cacheKeys, plans, hostRef, onPlan })
  useSlideHtml({ open: cursor !== null, deck, index: cursor ?? 0, fingerprint, content, noteTitle, dark })
  const key = cursor === null ? '' : cacheKeys[cursor] ?? ''
  if (!key || !readSlideHtml(key)) return null

  return (
    <div
      ref={hostRef}
      aria-hidden
      inert
      data-slide-preflight
      className='pointer-events-none invisible fixed top-0 left-0'
      style={{ width: metrics.designWidth, height: metrics.designHeight }}
    >
      <SlideCanvas
        key={`${fingerprint}:${cursor}`}
        cacheKey={key}
        source={deck[cursor ?? 0] ?? ''}
        subPage={0}
        contentWidth={metrics.contentWidth}
        contentHeight={metrics.contentHeight}
        onPlan={report}
      />
    </div>
  )
}

// The pass itself: which slide is being measured, what to do with its measurement and how
// one slide hands over to the next. It advances on the canvas's own report, so a slide's
// plan is always the one measured from the markup that was really on screen.
function usePreflightPass({ deckLength, fingerprint, cacheKeys, plans, hostRef, onPlan }: {
  deckLength: number
  fingerprint: string
  cacheKeys: string[]
  plans: Record<number, SlidePlan>
  hostRef: RefObject<HTMLDivElement | null>
  onPlan: (slide: number, plan: SlidePlan) => void
}): { cursor: number | null; report: (plan: SlidePlan) => void } {
  const reported = useRef(plans)
  reported.current = plans
  const skipped = useRef<Set<number>>(new Set())
  const idle = useRef<(() => void) | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const cursorRef = useRef<number | null>(null)
  cursorRef.current = cursor

  // One slide per idle slice keeps a long deck from holding frames while someone is
  // talking; the fallback timer covers browsers without requestIdleCallback.
  const scheduleNext = useCallback((from: number) => {
    idle.current?.()
    idle.current = scheduleIdle(() => {
      setCursor(nextUnmeasuredSlide(deckLength, measuredSlides(reported.current, skipped.current), from))
    })
  }, [deckLength])

  // An edited note re-splits into different slides, so the pass starts over and waits
  // for idle before its first mount rather than competing with the show's first paint.
  useEffect(() => {
    skipped.current = new Set()
    scheduleNext(0)
    return () => idle.current?.()
  }, [deckLength, fingerprint, scheduleNext])

  const report = useCallback((plan: SlidePlan) => {
    const slide = cursorRef.current
    if (slide === null) return
    const html = hostRef.current?.querySelector<HTMLElement>('[data-slide-page]')?.innerHTML
    const key = cacheKeys[slide]
    if (html && key) rememberSlideHtml(key, html)
    onPlan(slide, plan)
    scheduleNext(slide + 1)
  }, [cacheKeys, hostRef, onPlan, scheduleNext])

  // A slide that never reports (a pathological diagram, say) is skipped instead of
  // pausing the pass; the canvas still measures it when the presenter reaches it.
  useEffect(() => {
    if (cursor === null) return
    const stalled = window.setTimeout(() => {
      skipped.current.add(cursor)
      scheduleNext(cursor + 1)
    }, STALL_MS)
    return () => window.clearTimeout(stalled)
  }, [cursor, scheduleNext])

  return { cursor, report }
}

function measuredSlides(plans: Record<number, SlidePlan>, skipped: Set<number>): number[] {
  return [...Object.keys(plans).map(Number), ...skipped]
}

function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(callback, IDLE_FALLBACK_MS)
  return () => window.clearTimeout(timer)
}
