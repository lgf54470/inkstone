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
  content: string
  noteTitle: string
  onPlan: (slide: number, plan: SlidePlan) => void
}

export function SlidePreflight({ deck, cacheKeys, fingerprint, metrics, content, noteTitle, onPlan }: SlidePreflightProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const dark = useIsDarkTheme()
  const { cursor, report } = usePreflightPass({ deckLength: deck.length, fingerprint, dark, cacheKeys, hostRef, onPlan })
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

// The pass keeps its own progress and its own timer: what it has visited, what it gave up on,
// and the idle handle it would cancel. Deriving the progress from the measured plans would be
// wrong, because a plan outlives a theme flip while the markup it was measured from does not —
// every slide has to be visited again to put the diagrams back into the cache for the new theme.
function usePassState(): {
  done: RefObject<Set<number>>
  skipped: RefObject<Set<number>>
  idle: RefObject<(() => void) | null>
  cursorRef: RefObject<number | null>
} {
  return {
    done: useRef<Set<number>>(new Set()),
    skipped: useRef<Set<number>>(new Set()),
    idle: useRef<(() => void) | null>(null),
    cursorRef: useRef<number | null>(null),
  }
}

// The pass itself: which slide is being measured, what to do with its measurement and how
// one slide hands over to the next. It advances on the canvas's own report, so a slide's
// plan is always the one measured from the markup that was really on screen.
function usePreflightPass({ deckLength, fingerprint, dark, cacheKeys, hostRef, onPlan }: {
  deckLength: number
  fingerprint: string
  dark: boolean
  cacheKeys: string[]
  hostRef: RefObject<HTMLDivElement | null>
  onPlan: (slide: number, plan: SlidePlan) => void
}): { cursor: number | null; report: (plan: SlidePlan) => void } {
  const pass = usePassState()
  const { done, skipped, idle, cursorRef } = pass
  const [cursor, setCursor] = useState<number | null>(null)
  cursorRef.current = cursor

  // One slide per idle slice keeps a long deck from holding frames while someone is talking; the
  // fallback timer covers browsers without requestIdleCallback.
  const scheduleNext = useCallback((from: number) => {
    idle.current?.()
    idle.current = scheduleIdle(() => {
      setCursor(nextUnmeasuredSlide(deckLength, [...done.current, ...skipped.current], from))
    })
  }, [deckLength, done, skipped, idle])

  // An edited note re-splits into different slides and a theme flip invalidates every slide's
  // markup, so either way the pass starts over and waits for idle before its first mount rather
  // than competing with the show's first paint.
  useEffect(() => {
    done.current = new Set()
    skipped.current = new Set()
    scheduleNext(0)
    return () => idle.current?.()
  }, [deckLength, fingerprint, dark, scheduleNext, done, skipped, idle])

  const report = useCallback((plan: SlidePlan) => {
    const slide = cursorRef.current
    if (slide === null) return
    publishPlan(slide, plan, { hostRef, cacheKeys, onPlan })
    done.current.add(slide)
    scheduleNext(slide + 1)
  }, [cacheKeys, hostRef, onPlan, scheduleNext])

  // A slide that never reports (a pathological diagram, say) is skipped instead of pausing the
  // pass; the canvas still measures it when the presenter reaches it.
  const skipStalled = useCallback((slide: number) => {
    skipped.current.add(slide)
    scheduleNext(slide + 1)
  }, [scheduleNext])
  useStallGuard(cursor, skipStalled)

  return { cursor, report }
}

// What a measurement means: the markup it came from goes back to the cache under the slide's key
// (so the projector's later visit is a cache hit instead of a second render) and the plan goes to
// the show, which lists this slide's pages.
function publishPlan(slide: number, plan: SlidePlan, { hostRef, cacheKeys, onPlan }: {
  hostRef: RefObject<HTMLDivElement | null>
  cacheKeys: string[]
  onPlan: (slide: number, plan: SlidePlan) => void
}): void {
  const html = hostRef.current?.querySelector<HTMLElement>('[data-slide-page]')?.innerHTML
  const key = cacheKeys[slide]
  if (html && key) rememberSlideHtml(key, html)
  onPlan(slide, plan)
}

function useStallGuard(cursor: number | null, onStall: (slide: number) => void): void {
  useEffect(() => {
    if (cursor === null) return
    const stalled = window.setTimeout(() => onStall(cursor), STALL_MS)
    return () => window.clearTimeout(stalled)
  }, [cursor, onStall])
}

function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(callback, IDLE_FALLBACK_MS)
  return () => window.clearTimeout(timer)
}
