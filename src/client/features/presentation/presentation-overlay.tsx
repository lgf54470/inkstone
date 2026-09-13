import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react'
import { t } from '../../lib/i18n'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { destroyChartInstances, enhancePreview, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { IconButton } from '../../components/primitives'
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { useSession } from '../../store/session'
import { splitIntoSlides } from './slides'

// Slide canvases are laid out at a fixed 16:9 design size and scaled to the stage,
// so proportions stay stable from phone to projector (same approach as reveal.js).
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720
const SLIDE_PAD_X = 56
const SLIDE_PAD_Y = 40
const SLIDE_CONTENT_WIDTH = SLIDE_WIDTH - SLIDE_PAD_X * 2
const SLIDE_CONTENT_HEIGHT = SLIDE_HEIGHT - SLIDE_PAD_Y * 2
const SLIDE_HTML_CACHE_LIMIT = 60

// Enhanced per-slide markup keyed by content fingerprint + theme + slide index,
// so a remount (e.g. across fullscreen toggles) reuses the last good html instead
// of resetting diagrams to their loading placeholders.
const slideHtmlCache = new Map<string, string>()

function hashContent(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index++) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  return `${value.length}:${(hash >>> 0).toString(36)}`
}

function rememberSlideHtml(key: string, html: string): void {
  slideHtmlCache.delete(key)
  slideHtmlCache.set(key, html)
  while (slideHtmlCache.size > SLIDE_HTML_CACHE_LIMIT) {
    const oldest = slideHtmlCache.keys().next().value
    if (oldest === undefined) break
    slideHtmlCache.delete(oldest)
  }
}

function slideCacheKey(fingerprint: string, dark: boolean, index: number): string {
  return `${fingerprint}:${dark ? 'd' : 'l'}:${index}`
}

export interface PresentationOverlayProps {
  open: boolean
  onClose: () => void
  content: string
  noteTitle: string
}

export function PresentationOverlay({ open, onClose, content, noteTitle }: PresentationOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { presentedContent, deck, fingerprint } = useFrozenDeck(open, content)
  const dark = useIsDarkTheme()
  const { index, sub, pageCount, handlePageCount, goNext, goPrev, jumpTo } = usePresentationNav(deck.length)
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(open, panelRef)
  const scale = useStageScale(stageRef)
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef, panelRef)
  useSlideHtml({ open, deck, index, fingerprint, content: presentedContent, noteTitle, dark })
  usePresentationKeys(open, deck.length, goNext, goPrev, jumpTo, toggleFullscreen)

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role='dialog'
      aria-modal='true'
      aria-label={t('workspace.presentation_mode')}
      className='anim-fade fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--bg-base)] outline-none'
    >
      <div ref={stageRef} className='flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3'>
        <div
          className='shrink-0 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-editor)] shadow-[var(--shadow-modal)]'
          style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})` }}
        >
          <SlideCanvas key={index} cacheKey={slideCacheKey(fingerprint, dark, index)} source={deck[index] ?? ''} subPage={sub} onPageCount={handlePageCount} />
        </div>
      </div>
      <PresentationControls
        slideIndex={index}
        subPage={sub}
        pageCount={pageCount}
        slideCount={deck.length}
        isFullscreen={isFullscreen}
        goNext={goNext}
        goPrev={goPrev}
        toggleFullscreen={toggleFullscreen}
        onClose={onClose}
      />
      <SlideProgress index={index} count={deck.length} />
      <SlideProgress index={index} count={deck.length} />
    </div>,
    document.body,
  )
}

function SlideProgress({ index, count }: { index: number; count: number }) {
  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--border-subtle)]' aria-hidden='true'>
      <div className='h-full bg-[var(--accent)]' style={{ width: `${Math.round(((index + 1) / count) * 100)}%` }} />
    </div>
  )
}

// Freeze the deck on open: presenting shows a snapshot, and store/editor content
// updates (which flap during fullscreen resizes) must not re-split the deck
// mid-show and remount every slide.
function useFrozenDeck(open: boolean, content: string) {
  const [frozenContent, setFrozenContent] = useState<string | null>(null)
  if (open && frozenContent === null) setFrozenContent(content)
  if (!open && frozenContent !== null) setFrozenContent(null)
  const presentedContent = frozenContent ?? content
  const deck = useMemo(() => splitIntoSlides(presentedContent), [presentedContent])
  const fingerprint = useMemo(() => hashContent(presentedContent), [presentedContent])
  return { presentedContent, deck, fingerprint }
}

// Renders the enhanced markup off-DOM and caches it per slide; the cache hit is
// what keeps diagrams alive across any remount of the slide subtree.
function useSlideHtml(options: { open: boolean; deck: string[]; index: number; fingerprint: string; content: string; noteTitle: string; dark: boolean }): void {
  const { open, deck, index, fingerprint, content, noteTitle, dark } = options
  const preview = useSession((s) => s.settings.preview)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const key = slideCacheKey(fingerprint, dark, index)
    if (slideHtmlCache.has(key)) return
    let cancelled = false
    const rendered = renderMarkdown(deck[index] ?? '', { externalImages: preview.externalImages, hideFrontMatter: true })
    rememberSlideHtml(key, rendered.html)
    setTick((tick) => tick + 1)
    const staging = document.createElement('div')
    staging.innerHTML = rendered.html
    const prepare = async () => {
      if (rendered.hasEmbeds) {
        await resolveNoteEmbeds(staging, { currentContent: content, currentTitle: noteTitle, isCurrent: () => !cancelled })
      }
      await enhancePreview(staging, { math: preview.math, mermaid: preview.mermaid, dark, codeBlockCollapseLines: 0 })
      if (cancelled) return
      rememberSlideHtml(key, staging.innerHTML)
      setTick((tick) => tick + 1)
    }
    void prepare()
    return () => {
      cancelled = true
    }
  }, [open, deck, index, fingerprint, content, noteTitle, dark, preview.externalImages, preview.math, preview.mermaid])
}

function useDeckIndex(deckLength: number) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    setIndex((current) => Math.min(current, deckLength - 1))
  }, [deckLength])
  const goTo = useCallback((next: number) => setIndex(Math.max(0, Math.min(next, deckLength - 1))), [deckLength])
  return { index, goTo }
}

// Slide-level position plus auto-pagination sub-pages: a slide whose rendered
// blocks overflow the fixed canvas reports its page count, and next/prev walk
// through its sub-pages before moving to the neighboring slide.
function usePresentationNav(deckLength: number) {
  const { index, goTo } = useDeckIndex(deckLength)
  const [subPage, setSubPage] = useState(0)
  const [pageCounts, setPageCounts] = useState<Record<number, number>>({})
  useEffect(() => {
    setSubPage(0)
  }, [index])
  const registerPageCount = useCallback((slide: number, count: number) => {
    setPageCounts((current) => (current[slide] === count ? current : { ...current, [slide]: count }))
  }, [])
  const handlePageCount = useCallback((count: number) => registerPageCount(index, count), [index, registerPageCount])
  const pageCount = pageCounts[index] ?? 1
  const sub = Math.min(subPage, pageCount - 1)
  const goNext = useCallback(() => {
    if (sub < pageCount - 1) setSubPage(sub + 1)
    else if (index < deckLength - 1) {
      goTo(index + 1)
      setSubPage(0)
    }
  }, [sub, pageCount, index, deckLength, goTo])
  const goPrev = useCallback(() => {
    if (sub > 0) setSubPage(sub - 1)
    else if (index > 0) {
      goTo(index - 1)
      setSubPage(0)
    }
  }, [sub, index, goTo])
  const jumpTo = useCallback((slide: number) => {
    goTo(slide)
    setSubPage(0)
  }, [goTo])
  return { index, sub, pageCount, handlePageCount, goNext, goPrev, jumpTo }
}

function useFullscreenToggle(open: boolean, panelRef: RefObject<HTMLDivElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => {
    const request = document.fullscreenElement ? document.exitFullscreen() : panelRef.current?.requestFullscreen()
    if (request) request.catch((err) => console.debug('[inkstone] fullscreen request rejected', err))
  }, [panelRef])
  useEffect(() => {
    if (!open) return
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [open])
  return { isFullscreen, toggleFullscreen }
}

// Navigation keys always move slides so a stray focused control can never trap
// the keyboard; Space/Enter yield to the focused control to avoid double actions.
function usePresentationKeys(open: boolean, deckLength: number, goNext: () => void, goPrev: () => void, jumpTo: (next: number) => void, toggleFullscreen: () => void) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const onControl = Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]'))
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          event.preventDefault()
          goNext()
          return
        case ' ':
        case 'Enter':
          if (onControl) return
          event.preventDefault()
          goNext()
          return
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault()
          goPrev()
          return
        case 'Home':
          event.preventDefault()
          jumpTo(0)
          return
        case 'End':
          event.preventDefault()
          jumpTo(deckLength - 1)
          return
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, deckLength, goNext, goPrev, jumpTo, toggleFullscreen])
}

interface SlidePage {
  from: number
  to: number
  top: number
}

function SlideCanvas({ cacheKey, source, subPage, onPageCount }: { cacheKey: string; source: string; subPage: number; onPageCount: (count: number) => void }) {
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const preview = useSession((s) => s.settings.preview)
  const dark = useIsDarkTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const fallbackHtml = useMemo(
    () => renderMarkdown(source, { externalImages: preview.externalImages, hideFrontMatter: true }).html,
    [source, preview.externalImages],
  )
  const html = slideHtmlCache.get(cacheKey) ?? fallbackHtml
  useSlideDiagramRendering(hostRef, dark)
  const pageTop = useSlidePagination(hostRef, html, subPage, onPageCount)

  return (
    <div className='relative h-full w-full overflow-hidden'>
      <div className='absolute inset-x-0' style={{ top: SLIDE_PAD_Y, transform: `translateY(-${pageTop}px)` }}>
        <div className='mx-auto' style={{ width: SLIDE_CONTENT_WIDTH }}>
          <div className='ink-preview-container' data-font={proseFont}>
            <div ref={hostRef} data-font={proseFont} className='ink-prose relative' dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Diagram rendering is observer-driven: whatever commits new slide markup
// (cache fill, remount, fullscreen relayout), pending chart/mermaid blocks on
// the live host get rendered; the data-rendered signature keeps re-runs cheap.
function useSlideDiagramRendering(hostRef: RefObject<HTMLDivElement | null>, dark: boolean): void {
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let generation = 0
    const run = () => {
      const current = ++generation
      void renderPendingMermaid(host, dark).then(() => {
        if (current === generation) return renderChartJs(host, dark)
      })
    }
    run()
    const observer = new MutationObserver(() => run())
    observer.observe(host, { childList: true })
    return () => {
      generation++
      observer.disconnect()
      destroyChartInstances(host)
    }
  }, [dark, hostRef])
}

// Oversized slides flow across pages instead of scrolling or shrinking: page
// boundaries snap to block edges, off-page blocks hide via visibility (layout
// stays intact so charts never re-measure), and the wrapper translates so the
// current page starts at the top.
function useSlidePagination(hostRef: RefObject<HTMLDivElement | null>, html: string, subPage: number, onPageCount: (count: number) => void): number {
  const [pages, setPages] = useState<SlidePage[]>([])
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let lastHeight = -1
    const compute = () => {
      const total = host.scrollHeight
      if (total < 1 || total === lastHeight) return
      lastHeight = total
      const children = [...host.children] as HTMLElement[]
      const next: SlidePage[] = [{ from: 0, to: children.length, top: 0 }]
      let pageTop = 0
      children.forEach((child, i) => {
        const page = next[next.length - 1]
        const bottom = child.offsetTop + child.offsetHeight
        if (bottom > pageTop + SLIDE_CONTENT_HEIGHT && child.offsetTop > pageTop) {
          // Keep headings attached to the block that follows them across breaks.
          let cut = i
          while (cut > page.from && /^H[1-6]$/.test(children[cut - 1]?.tagName ?? '')) cut--
          page.to = cut
          next.push({ from: cut, to: children.length, top: children[cut]!.offsetTop })
          pageTop = children[cut]!.offsetTop
        }
      })
      setPages(next)
      onPageCount(next.length)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(host)
    return () => observer.disconnect()
  }, [hostRef, html, onPageCount])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const children = [...host.children] as HTMLElement[]
    const page = pages[subPage] ?? null
    children.forEach((child, i) => {
      const inPage = !page || (i >= page.from && i < page.to)
      child.style.visibility = inPage ? '' : 'hidden'
      const lone = Boolean(page) && page.to - page.from === 1 && child.offsetHeight > SLIDE_CONTENT_HEIGHT
      child.style.maxHeight = lone ? `${SLIDE_CONTENT_HEIGHT}px` : ''
      child.style.overflowY = lone ? 'auto' : ''
    })
  }, [pages, subPage, html, hostRef])

  return pages[subPage]?.top ?? 0
}

function PresentationControls({ slideIndex, subPage, pageCount, slideCount, isFullscreen, goNext, goPrev, toggleFullscreen, onClose }: {
  slideIndex: number
  subPage: number
  pageCount: number
  slideCount: number
  isFullscreen: boolean
  goNext: () => void
  goPrev: () => void
  toggleFullscreen: () => void
  onClose: () => void
}) {
  const fullscreenLabel = isFullscreen ? t('workspace.presentation_exit_fullscreen') : t('workspace.presentation_fullscreen')
  const position = pageCount > 1 ? `${slideIndex + 1}.${subPage + 1}` : `${slideIndex + 1}`
  return (
    <div className='absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'>
      <Tooltip label={t('workspace.presentation_prev')} side='top'>
        <IconButton label={t('workspace.presentation_prev')} size='sm' onClick={goPrev} disabled={slideIndex === 0 && subPage === 0}>
          <ChevronLeft size={15} />
        </IconButton>
      </Tooltip>
      <span aria-live='polite' className='tabular min-w-14 text-center text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {position} / {slideCount}
      </span>
      <Tooltip label={t('workspace.presentation_next')} side='top'>
        <IconButton label={t('workspace.presentation_next')} size='sm' onClick={goNext} disabled={slideIndex === slideCount - 1 && subPage === pageCount - 1}>
          <ChevronRight size={15} />
        </IconButton>
      </Tooltip>
      <span className='mx-1 h-4 w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Tooltip label={fullscreenLabel} side='top'>
        <IconButton label={fullscreenLabel} size='sm' onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_exit')} side='top'>
        <IconButton label={t('workspace.presentation_exit')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function useStageScale(stageRef: RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 }
      if (width < 1 || height < 1) return
      setScale(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stageRef])
  return scale
}

function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark((document.documentElement.dataset.theme ?? 'dark') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}
