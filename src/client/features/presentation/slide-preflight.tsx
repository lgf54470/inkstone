import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nextSliceGap, nextUnmeasuredSlide } from './presentation-state'
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
// Waiting for a real idle window (bounded by the timeout, so the pass always finishes) is what
// keeps this background work off the presenter's frames; the timeout is generous because filling
// the slide list slightly later costs nothing, while a stutter during a talk does.
const IDLE_TIMEOUT_MS = 2_500
// Rendering one slide — markup, diagrams, a pagination measurement — is a single commit of tens
// of milliseconds that cannot be preempted, so starting it in a nearly spent idle window is
// exactly what drops a frame. A slice runs only when the browser reports this much headroom.
const SLICE_BUDGET_MS = 14
// A quiet gap between two slides so consecutive renders cannot cluster into a busy stretch,
// widened in proportion to what the last slice cost: the pass aims to use a quarter of the
// main thread (see nextSliceGap), so the deck fills without holding frames.
const SLICE_DUTY = 4
const MIN_SLICE_GAP_MS = 120

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
  // The canvas waits one frame after the markup lands. Preparing a slide is a markdown render,
  // and React would otherwise flush the mount and its layout measure into the same task, making
  // one long commit out of work the browser could have interleaved with a frame.
  const ready = useDeferredMount(Boolean(key) && Boolean(readSlideHtml(key)), key)
  if (!ready) return null

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

// True one frame after `ready` flips for this token, so whatever the flag announces is committed
// in a task of its own instead of extending the task that produced it.
function useDeferredMount(ready: boolean, token: string): boolean {
  const [mounted, setMounted] = useState('')
  useEffect(() => {
    setMounted('')
    if (!ready) return
    const frame = window.requestAnimationFrame(() => setMounted(token))
    return () => window.cancelAnimationFrame(frame)
  }, [ready, token])
  return ready && mounted === token
}

// The pass keeps its own progress and its own timers: what it has visited, what it gave up on,
// the idle handle it would cancel, and how long the last slice took. Deriving the progress from
// the measured plans would be wrong, because a plan outlives a theme flip while the markup it was
// measured from does not — every slide has to be visited again to put the diagrams back into the
// cache for the new theme.
function usePassState(): {
  done: RefObject<Set<number>>
  skipped: RefObject<Set<number>>
  idle: RefObject<(() => void) | null>
  sliceStart: RefObject<number>
  sliceCost: RefObject<number>
  cursorRef: RefObject<number | null>
} {
  return {
    done: useRef<Set<number>>(new Set()),
    skipped: useRef<Set<number>>(new Set()),
    idle: useRef<(() => void) | null>(null),
    sliceStart: useRef(0),
    sliceCost: useRef(0),
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
  const { done, skipped, idle, sliceStart, sliceCost, cursorRef } = pass
  const [cursor, setCursor] = useState<number | null>(null)
  cursorRef.current = cursor

  // One slide per idle slice keeps a long deck from holding frames while someone is talking; the
  // fallback timer covers browsers without requestIdleCallback.
  const scheduleNext = useCallback((from: number) => {
    idle.current?.()
    const gap = nextSliceGap(sliceCost.current, SLICE_DUTY, MIN_SLICE_GAP_MS)
    idle.current = scheduleIdle(() => {
      sliceStart.current = performance.now()
      setCursor(nextUnmeasuredSlide(deckLength, [...done.current, ...skipped.current], from))
    }, gap)
  }, [deckLength, done, skipped, idle, sliceStart, sliceCost])

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
    noteSliceCost(sliceStart, sliceCost)
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

function noteSliceCost(sliceStart: RefObject<number>, sliceCost: RefObject<number>): void {
  const cost = performance.now() - sliceStart.current
  if (cost > 0 && cost < STALL_MS) sliceCost.current = cost
}

function useStallGuard(cursor: number | null, onStall: (slide: number) => void): void {
  useEffect(() => {
    if (cursor === null) return
    const stalled = window.setTimeout(() => onStall(cursor), STALL_MS)
    return () => window.clearTimeout(stalled)
  }, [cursor, onStall])
}

// An idle slice after a quiet gap: the gap keeps slices apart, and the idle callback makes the
// browser hand over a window it considers free — with the deadline re-checked, so a slice is
// deferred to the next window instead of blocking a frame. Browsers without requestIdleCallback
// simply run one slice per timer tick.
function scheduleIdle(callback: () => void, gapMs: number): () => void {
  const idle = typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function'
  let cancelled = false
  let idleHandle = 0
  let timer = 0
  const request = () => {
    if (!idle) {
      timer = window.setTimeout(() => {
        if (!cancelled) callback()
      }, IDLE_FALLBACK_MS)
      return
    }
    idleHandle = window.requestIdleCallback((deadline) => {
      if (cancelled) return
      if (deadline.didTimeout || deadline.timeRemaining() >= SLICE_BUDGET_MS) callback()
      else request()
    }, { timeout: IDLE_TIMEOUT_MS })
  }
  timer = window.setTimeout(request, gapMs)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
    if (idleHandle) window.cancelIdleCallback(idleHandle)
  }
}
