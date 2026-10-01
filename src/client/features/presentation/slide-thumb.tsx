// One slide page drawn small, shared by every surface that shows the deck at a glance: the
// sidebar list and the overview grid. It lives here because the two must not disagree about how
// a page is sliced, scaled and labelled — and because the viewport gate that keeps a long deck
// from rendering every page at once is a single observer both of them share.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react'
import type { ProseFont } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { RailEntry } from './presentation-state'
import { readSlideHtml, renderSlideSource, slicePageHtml, subscribeSlideHtmlKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_X, SLIDE_PAD_Y } from './slide-stage'

const THUMB_PREFETCH_MARGIN = '320px'

export interface ThumbMetrics {
  width: number
  height: number
  scale: number
  contentWidth: number
  contentHeight: number
}

export interface ThumbView {
  thumb: ThumbMetrics
  designWidth: number
  designHeight: number
  externalImages: boolean
  proseFont: ProseFont
}

// The thumbnail is the design canvas at a fraction of its size, so it carries the slide's real
// layout rather than a re-typeset approximation of it; the content box has to shrink by the same
// padding the projector gives the page, or a sliced page would not match what was measured.
export function thumbMetrics(width: number, designWidth: number, designHeight: number): ThumbMetrics {
  const scale = width / designWidth
  return {
    width,
    height: designHeight * scale,
    scale,
    contentWidth: designWidth - SLIDE_PAD_X * 2,
    contentHeight: designHeight - SLIDE_PAD_Y * 2,
  }
}

// The view every card of one surface shares: the scale it draws at, the design canvas it is a
// picture of, and the two settings that decide what the markup looks like. A memo because a card
// re-renders per page, and a new object each time would re-render the markup of every one of them.
export function useThumbView({ thumbWidth, designWidth, designHeight, externalImages, proseFont }: {
  thumbWidth: number
  designWidth: number
  designHeight: number
  externalImages: boolean
  proseFont: ProseFont
}): ThumbView {
  return useMemo(
    () => ({ thumb: thumbMetrics(thumbWidth, designWidth, designHeight), designWidth, designHeight, externalImages, proseFont }),
    [thumbWidth, designWidth, designHeight, externalImages, proseFont],
  )
}

// A page's label has to name the slide as well: both lists are pages, and a presenter
// jumping to "page 3 of 14" still needs to know which `---` slide it belongs to.
export function pageLabel(entry: RailEntry, deckLength: number): string {
  if (entry.pageCount <= 1) return t('workspace.presentation_slide_number', { value0: entry.slide + 1, value1: deckLength })
  return t('workspace.presentation_slide_page_number', {
    value0: entry.slide + 1,
    value1: deckLength,
    value2: entry.sub + 1,
    value3: entry.pageCount,
  })
}

export function extractSlideHeading(source: string): string {
  const lines = source.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    const headingMatch = /^#{1,6}\s+(.+)$/.exec(trimmed)
    if (headingMatch?.[1]) {
      return headingMatch[1].trim()
    }
  }
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (trimmed && !trimmed.startsWith('<!--') && !trimmed.startsWith('---')) {
      return trimmed.slice(0, 30)
    }
  }
  return ''
}

// Thumbnails render from the same cached markup the canvas measured, so a page's image matches
// what the projector shows for it; the slice keeps one page's blocks per entry instead of
// mounting the whole slide once per page.
export function usePageHtml({ near, cacheKey, cached, source, plan, sub, view }: {
  near: boolean
  cacheKey: string
  cached: string
  source: string
  plan: SlidePlan | undefined
  sub: number
  view: ThumbView
}): string {
  return useMemo(() => {
    if (!near) return ''
    const html = cached || renderSlideSource(source, view.externalImages).html
    if (!plan) return html
    return slicePageHtml(html, plan, sub, view.thumb.contentWidth, view.thumb.contentHeight)
  }, [near, cacheKey, cached, source, plan, sub, view])
}

// Follows the prepared markup rather than reading it once: a theme flip or an edit replaces a
// slide's markup under a card, and a single read left that card on an un-rendered placeholder
// for the rest of the show.
export function useCachedSlideHtml(cacheKey: string): string {
  const subscribe = useCallback((cb: () => void) => subscribeSlideHtmlKey(cacheKey, cb), [cacheKey])
  return useSyncExternalStore(subscribe, () => readSlideHtml(cacheKey)?.html ?? '', () => '')
}

export function SlideThumb({ thumbRef, near, html, active, view, className }: {
  thumbRef: RefObject<HTMLSpanElement | null>
  near: boolean
  html: string
  active: boolean
  view: ThumbView
  className?: string
}) {
  return (
    <span
      ref={thumbRef}
      aria-hidden='true'
      // The preview is decorative: `inert` keeps the slide's own links and copy buttons out of
      // the tab order and out of the wrapping card's hit area.
      inert
      className={cn('ink-slide-thumb relative block shrink-0 overflow-hidden rounded-[var(--r-sm)] border bg-[var(--bg-editor)]', active ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]', className)}
      style={{ width: view.thumb.width, height: view.thumb.height }}
    >
      {near && (
        <span className='ink-slide absolute top-0 left-0 block' style={{ width: view.designWidth, height: view.designHeight, transform: `scale(${view.thumb.scale})`, transformOrigin: 'top left' }}>
          <span className='absolute inset-x-0 block' style={{ top: SLIDE_PAD_Y }}>
            <SlideProse html={html} contentWidth={view.thumb.contentWidth} font={view.proseFont} />
          </span>
        </span>
      )}
    </span>
  )
}

// One observer for every card on screen, rather than one per page of the deck: a hundred-slide
// note used to register a hundred listeners whose callbacks all fired in the same task.
type ObserverCallback = (isIntersecting: boolean) => void

let sharedThumbObserver: IntersectionObserver | null = null
const thumbObserverCallbacks = new Map<Element, ObserverCallback>()

function getSharedThumbObserver(): IntersectionObserver {
  if (!sharedThumbObserver) {
    sharedThumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const cb = thumbObserverCallbacks.get(entry.target)
        if (cb) cb(entry.isIntersecting)
      }
    }, { rootMargin: THUMB_PREFETCH_MARGIN })
  }
  return sharedThumbObserver
}

function observeThumbElement(element: Element, callback: ObserverCallback): () => void {
  const observer = getSharedThumbObserver()
  thumbObserverCallbacks.set(element, callback)
  observer.observe(element)
  return () => {
    thumbObserverCallbacks.delete(element)
    observer.unobserve(element)
    if (thumbObserverCallbacks.size === 0) {
      observer.disconnect()
      sharedThumbObserver = null
    }
  }
}

export function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observeThumbElement(element, setNear)
  }, [ref])
  return near
}
