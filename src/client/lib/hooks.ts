import { useCallback, useEffect, useRef, useState } from 'react'
import { relativeTime } from './time'


function mediaMatches(query: string): boolean {
  // jsdom and other partial window implementations lack matchMedia; same reading as the SSR fallback.
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
}

// Exported for the music hub's narrow-screen layouts, which read the same breakpoint.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => mediaMatches(query))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// A component that folds by available space has to measure the box it was actually given:
// the viewport says nothing about a dialog's centre column. Null until a box is measured, so callers
// keep a fallback where ResizeObserver does not exist (jsdom, SSR).
//
// FB3-C9: the ref is handed out by the hook instead of being passed in, because the box a caller
// measures often does not exist yet when the component first renders — the library draws its loading
// state first and only mounts the box its rows live in once they arrive. An observer attached from a
// mount effect never sees that box, and the caller then answers from its fallback for as long as it
// lives (measured in the running app: a hub window 1060px wide with a 538px centre column drew the
// full 572px-wide table, a row wider than the column holding it).
//
// The node is also read as it is attached, in the commit that puts it on screen: the observer's first
// callback arrives a task later, and a frame drawn from the fallback is a frame drawn in the shape the
// fold exists to avoid. The read reports the content box, the same number the observer reports next, so
// the two cannot disagree and jump on the first callback.
export function useElementWidth<T extends HTMLElement = HTMLElement>(): { ref: (node: T | null) => void; width: number | null } {
  const [width, setWidth] = useState<number | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    // A box the browser draws nothing for is not a measurement: jsdom has no layout and answers 0 for
    // every box, and an element inside a `display: none` subtree answers 0 too. Those keep the `null`
    // that says nothing was measured, so the caller answers from its own fallback.
    if (node.clientWidth > 0) setWidth(contentBoxWidth(node))
    if (typeof ResizeObserver === 'undefined') return
    const next = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const value = Math.round(entry.contentRect.width)
      setWidth((previous) => (previous === value ? previous : value))
    })
    next.observe(node)
    observer.current = next
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return { ref, width }
}

// What `ResizeObserverEntry.contentRect` reports, read without an observer. An environment that
// answers no computed padding (jsdom) keeps the padding box rather than subtracting nothing.
function contentBoxWidth(node: HTMLElement): number {
  const style = getComputedStyle(node)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  return Math.round(node.clientWidth - (Number.isFinite(padding) ? padding : 0))
}

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export function useBreakpoint(): Breakpoint {
  const wide = useMediaQuery('(min-width: 1180px)')
  const medium = useMediaQuery('(min-width: 768px)')
  return wide ? 'desktop' : medium ? 'tablet' : 'mobile'
}


// Trailing debounce. `resetKey` names the subject the value belongs to: when it changes
// (another note, a session that just started) the held value belongs to the previous
// subject, so the current one is returned at once instead of after the delay.
export function useDebounced<T>(value: T, delay: number, resetKey?: unknown): T {
  const [debounced, setDebounced] = useState<{ key: unknown; value: T }>({ key: resetKey, value })
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced({ key: resetKey, value }), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay, resetKey])
  return debounced.key === resetKey ? debounced.value : value
}


export function useRelativeTime(timestamp: number, enabled = true): string {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !Number.isFinite(timestamp) || !timestamp) return
    const elapsed = Math.abs(Date.now() - timestamp)
    const delay = Math.max(1_000, 60_000 - (elapsed % 60_000))
    const timer = window.setTimeout(() => setTick((value) => value + 1), delay)
    return () => window.clearTimeout(timer)
  }, [enabled, tick, timestamp])
  return relativeTime(timestamp)
}

export function useNow(intervalMs = 60_000, enabled = true): number {
  const [tick, setTick] = useState(0)
  const interval = Number.isFinite(intervalMs) ? Math.max(1_000, Math.floor(intervalMs)) : 60_000
  useEffect(() => {
    if (!enabled) return
    const delay = Math.max(1, interval - (Date.now() % interval))
    const timer = window.setTimeout(() => setTick((value) => value + 1), delay)
    return () => window.clearTimeout(timer)
  }, [enabled, interval, tick])
  return Date.now()
}





