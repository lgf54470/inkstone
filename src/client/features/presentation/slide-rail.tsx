import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react'
import type { ProseFont } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { entryIndexOf, railEntries, type RailEntry } from './presentation-state'
import { readSlideHtml, renderSlideSource, slicePageHtml, subscribeSlideHtml } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { SlideProse } from './slide-prose'
import { SLIDE_PAD_X, SLIDE_PAD_Y } from './slide-stage'

export const SLIDE_RAIL_WIDTH = 216
const RAIL_THUMB_WIDTH = 148
const THUMB_PREFETCH_MARGIN = '320px'

interface ThumbMetrics {
  width: number
  height: number
  scale: number
  contentWidth: number
  contentHeight: number
}

interface RailView {
  thumb: ThumbMetrics
  designWidth: number
  designHeight: number
  externalImages: boolean
  proseFont: ProseFont
}

function thumbMetrics(designWidth: number, designHeight: number): ThumbMetrics {
  const scale = RAIL_THUMB_WIDTH / designWidth
  return {
    width: RAIL_THUMB_WIDTH,
    height: designHeight * scale,
    scale,
    contentWidth: designWidth - SLIDE_PAD_X * 2,
    contentHeight: designHeight - SLIDE_PAD_Y * 2,
  }
}

export interface SlideRailProps {
  deck: string[]
  cacheKeys: string[]
  plans: Record<number, SlidePlan>
  index: number
  sub: number
  designWidth: number
  designHeight: number
  title: string
  externalImages: boolean
  proseFont: ProseFont
  chromeHidden: boolean
  onSelectPage: (slide: number, sub: number) => void
}

export function SlideRail({ deck, cacheKeys, plans, index, sub, designWidth, designHeight, title, externalImages, proseFont, chromeHidden, onSelectPage }: SlideRailProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const entries = useMemo(() => railEntries(deck.length, plans), [deck.length, plans])
  const active = entryIndexOf(entries, index, sub)
  const view = useMemo<RailView>(
    () => ({ thumb: thumbMetrics(designWidth, designHeight), designWidth, designHeight, externalImages, proseFont }),
    [designWidth, designHeight, externalImages, proseFont],
  )
  // One stable ref callback for the whole list: the entry index rides on the
  // element, so re-renders never detach and re-attach every button.
  const registerItem = useCallback((element: HTMLButtonElement | null) => {
    if (!element) return
    const entry = Number(element.dataset.entryIndex)
    if (Number.isInteger(entry)) itemRefs.current[entry] = element
  }, [])
  // The list drives selection: focus moves with the show so the next arrow key
  // continues from where the presenter is, and the active page stays in view.
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const onKeyDown = useRailKeyboard(entries, active, onSelectPage, itemRefs)

  return (
    <nav
      aria-label={t('workspace.presentation_slides')}
      data-presentation-rail
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]',
        'transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]',
        chromeHidden && 'pointer-events-none opacity-0',
      )}
      style={{ width: SLIDE_RAIL_WIDTH }}
      onKeyDown={onKeyDown}
    >
      <p className='truncate px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-11)] font-medium tracking-[var(--tracking-label)] text-[var(--text-tertiary)] uppercase'>
        {title}
      </p>
      <SlideRailList deck={deck} cacheKeys={cacheKeys} plans={plans} entries={entries} active={active} view={view} onSelectPage={onSelectPage} registerItem={registerItem} />
    </nav>
  )
}

// The rail walks its own pages with the arrows, which is why the window-level
// presentation keys yield those four keys while focus sits inside the rail.
function useRailKeyboard(entries: RailEntry[], active: number, onSelectPage: (slide: number, sub: number) => void, itemRefs: RefObject<(HTMLButtonElement | null)[]>): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    const last = entries.length - 1
    const from = active < 0 ? 0 : active
    const target = event.key === 'ArrowDown' ? from + 1
      : event.key === 'ArrowUp' ? from - 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (target === null || entries.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const next = Math.min(Math.max(target, 0), last)
    const entry = entries[next]
    if (!entry) return
    onSelectPage(entry.slide, entry.sub)
    itemRefs.current[next]?.focus({ preventScroll: true })
  }, [entries, active, onSelectPage, itemRefs])
}

function SlideRailList({ deck, cacheKeys, plans, entries, active, view, onSelectPage, registerItem }: {
  deck: string[]
  cacheKeys: string[]
  plans: Record<number, SlidePlan>
  entries: RailEntry[]
  active: number
  view: RailView
  onSelectPage: (slide: number, sub: number) => void
  registerItem: (element: HTMLButtonElement | null) => void
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-[var(--sp-1)] overflow-y-auto px-[var(--sp-2)] pb-[var(--sp-3)]'>
      {entries.map((entry, item) => (
        <SlideRailItem
          key={`${entry.slide}-${entry.sub}`}
          entry={entry}
          entryIndex={item}
          cacheKey={cacheKeys[entry.slide] ?? ''}
          source={deck[entry.slide] ?? ''}
          plan={plans[entry.slide]}
          deckLength={deck.length}
          active={item === active}
          view={view}
          onSelectPage={onSelectPage}
          buttonRef={registerItem}
        />
      ))}
    </div>
  )
}

function SlideRailItem({ entry, entryIndex, cacheKey, source, plan, deckLength, active, view, onSelectPage, buttonRef }: {
  entry: RailEntry
  entryIndex: number
  cacheKey: string
  source: string
  plan: SlidePlan | undefined
  deckLength: number
  active: boolean
  view: RailView
  onSelectPage: (slide: number, sub: number) => void
  buttonRef: (element: HTMLButtonElement | null) => void
}) {
  const thumbRef = useRef<HTMLSpanElement>(null)
  const near = useNearViewport(thumbRef)
  // The thumbnail renders the prepared markup the projector shows, so it follows the cache
  // rather than reading it once: a theme flip or an edit replaces a slide's markup under it,
  // and a single read left the thumbnail on an un-rendered placeholder for the rest of the show.
  const cached = useSyncExternalStore(subscribeSlideHtml, () => readSlideHtml(cacheKey) ?? '', () => '')
  const html = usePageHtml({ near, cacheKey, cached, source, plan, sub: entry.sub, view })

  return (
    <button
      ref={buttonRef}
      type='button'
      data-entry-index={entryIndex}
      data-slide-index={entry.slide}
      data-slide-page={entry.sub}
      aria-current={active ? 'true' : undefined}
      aria-label={pageLabel(entry, deckLength)}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelectPage(entry.slide, entry.sub)}
      className={cn(
        'flex items-start gap-[var(--sp-2)] rounded-[var(--r-md)] p-[var(--sp-1)] text-left',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
        active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <span className={cn('tabular w-[var(--sp-4)] shrink-0 pt-0.5 text-center text-[length:var(--text-11)]', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')} aria-hidden='true'>
        {entryIndex + 1}
      </span>
      <SlideThumb thumbRef={thumbRef} near={near} html={html} active={active} view={view} />
    </button>
  )
}

// A page's label has to name the slide as well: the list is pages, and a presenter
// jumping to "page 3 of 14" still needs to know which `---` slide it belongs to.
function pageLabel(entry: RailEntry, deckLength: number): string {
  if (entry.pageCount <= 1) return t('workspace.presentation_slide_number', { value0: entry.slide + 1, value1: deckLength })
  return t('workspace.presentation_slide_page_number', {
    value0: entry.slide + 1,
    value1: deckLength,
    value2: entry.sub + 1,
    value3: entry.pageCount,
  })
}

// Thumbnails render from the same cached markup the canvas measured, so a page's
// image matches what the projector shows for it; the slice keeps one page's blocks
// per entry instead of mounting the whole slide once per page.
function usePageHtml({ near, cacheKey, cached, source, plan, sub, view }: { near: boolean; cacheKey: string; cached: string; source: string; plan: SlidePlan | undefined; sub: number; view: RailView }): string {
  return useMemo(() => {
    if (!near) return ''
    const html = cached || renderSlideSource(source, view.externalImages).html
    if (!plan) return html
    return slicePageHtml(html, plan, sub, view.thumb.contentWidth, view.thumb.contentHeight)
  }, [near, cacheKey, cached, source, plan, sub, view])
}

// Thumbnails are decorative and rendered from the same design canvas, so they show
// the slide's real layout; they mount only near the viewport because a long deck
// would otherwise render every page's markup up front.
function SlideThumb({ thumbRef, near, html, active, view }: {
  thumbRef: RefObject<HTMLSpanElement | null>
  near: boolean
  html: string
  active: boolean
  view: RailView
}) {
  return (
    <span
      ref={thumbRef}
      aria-hidden='true'
      // The preview is decorative: `inert` keeps the slide's own links and copy
      // buttons out of the tab order and out of the wrapping button's hit area.
      inert
      className={cn('ink-slide-rail-thumb relative shrink-0 overflow-hidden rounded-[var(--r-sm)] border bg-[var(--bg-editor)]', active ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]')}
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

function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      setNear(entries.some((entry) => entry.isIntersecting))
    }, { rootMargin: THUMB_PREFETCH_MARGIN })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return near
}
