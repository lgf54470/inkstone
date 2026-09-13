import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { t } from '../../lib/i18n'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { enhancePreview } from '../../lib/markdown/enhance'
import { useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { useSession } from '../../store/session'
import { useIsDarkTheme } from './presentation-theme'
import { PresentationControls, SlideProgress } from './presentation-controls'
import { SlideViewport } from './slide-canvas'
import { hashContent, readSlideHtml, rememberSlideHtml, renderSlideSource, slideCacheKey } from './slide-html'
import { SlideRail } from './slide-rail'
import { useStageMetrics, type StageMetrics } from './slide-stage'
import { splitIntoSlides } from './slides'
import { usePresentationKeys } from './use-presentation-keys'

const CHROME_IDLE_MS = 2600
const RAIL_DEFAULT_MIN_WIDTH = 768

export interface PresentationOverlayProps {
  open: boolean
  onClose: () => void
  content: string
  noteTitle: string
}

export function PresentationOverlay({ open, onClose, content, noteTitle }: PresentationOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const session = usePresentationSession({ open, content, noteTitle, panelRef, stageRef, onClose })

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role='dialog'
      aria-modal='true'
      aria-label={t('workspace.presentation_mode')}
      className='anim-fade fixed inset-0 z-[var(--z-modal)] flex overflow-hidden bg-[var(--bg-base)] outline-none'
    >
      {session.railOpen && (
        <SlideRail
          deck={session.deck}
          cacheKeys={session.cacheKeys}
          index={session.index}
          designWidth={session.metrics.designWidth}
          designHeight={session.metrics.designHeight}
          title={noteTitle}
          externalImages={session.externalImages}
          proseFont={session.proseFont}
          chromeHidden={session.chromeHidden}
          onSelect={session.jumpTo}
        />
      )}
      <PresentationStage stageRef={stageRef} session={session} />
      <PresentationControls
        slideIndex={session.index}
        slideCount={session.deck.length}
        subPage={session.sub}
        pageCount={session.pageCount}
        isFullscreen={session.isFullscreen}
        railOpen={session.railOpen}
        chromeHidden={session.chromeHidden}
        onPrev={session.goPrev}
        onNext={session.goNext}
        onToggleRail={session.toggleRail}
        onToggleFullscreen={session.toggleFullscreen}
        onClose={onClose}
      />
      <SlideProgress index={session.index} count={session.deck.length} chromeHidden={session.chromeHidden} />
    </div>,
    document.body,
  )
}

function PresentationStage({ stageRef, session }: { stageRef: RefObject<HTMLDivElement | null>; session: PresentationSession }) {
  return (
    <div ref={stageRef} className='relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden'>
      <SlideViewport
        metrics={session.metrics}
        cacheKey={session.cacheKeys[session.index] ?? ''}
        source={session.deck[session.index] ?? ''}
        subPage={session.sub}
        onPageCount={session.handlePageCount}
      />
    </div>
  )
}

interface PresentationSession {
  deck: string[]
  cacheKeys: string[]
  index: number
  sub: number
  pageCount: number
  railOpen: boolean
  chromeHidden: boolean
  isFullscreen: boolean
  metrics: StageMetrics
  proseFont: ProseFont
  externalImages: boolean
  handlePageCount: (count: number) => void
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  toggleFullscreen: () => void
  toggleRail: () => void
}

function usePresentationSession({ open, content, noteTitle, panelRef, stageRef, onClose }: {
  open: boolean
  content: string
  noteTitle: string
  panelRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}): PresentationSession {
  const { presentedContent, deck, fingerprint } = useFrozenDeck(open, content)
  const dark = useIsDarkTheme()
  const externalImages = useSession((s) => s.settings.preview.externalImages)
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const { index, sub, pageCount, handlePageCount, goNext, goPrev, jumpTo } = usePresentationNav(deck.length)
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(open, panelRef)
  const metrics = useStageMetrics(open, stageRef)
  const [railOpen, setRailOpen] = useState(defaultRailOpen)
  const chromeHidden = useChromeAutoHide(open && isFullscreen)
  const toggleRail = useCallback(() => setRailOpen((current) => !current), [])
  const cacheKeys = useMemo(() => deck.map((_, item) => slideCacheKey(fingerprint, dark, item)), [deck, fingerprint, dark])
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef, panelRef)
  useSlideHtml({ open, deck, index, fingerprint, content: presentedContent, noteTitle, dark })
  usePresentationKeys({ open, slideCount: deck.length, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail })
  return {
    deck,
    cacheKeys,
    index,
    sub,
    pageCount,
    railOpen,
    chromeHidden,
    isFullscreen,
    metrics,
    proseFont,
    externalImages,
    handlePageCount,
    goNext,
    goPrev,
    jumpTo,
    toggleFullscreen,
    toggleRail,
  }
}

function defaultRailOpen(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(min-width: ${RAIL_DEFAULT_MIN_WIDTH}px)`).matches
}

// Presenting is a full-screen activity: the controls and the slide list fade out
// while nothing happens and come back on the next pointer move or key press, so
// the slide itself owns the whole screen.
function useChromeAutoHide(active: boolean): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!active) {
      setHidden(false)
      return
    }
    let timer = 0
    const reveal = () => {
      window.clearTimeout(timer)
      setHidden(false)
      timer = window.setTimeout(() => setHidden(true), CHROME_IDLE_MS)
    }
    window.addEventListener('pointermove', reveal)
    window.addEventListener('pointerdown', reveal)
    window.addEventListener('keydown', reveal, true)
    reveal()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', reveal)
      window.removeEventListener('pointerdown', reveal)
      window.removeEventListener('keydown', reveal, true)
    }
  }, [active])
  return hidden
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
    // A cache hit was already enhanced (or is being enhanced), which is what keeps
    // diagrams from resetting to their loading placeholders on every remount.
    if (readSlideHtml(key)) return
    let cancelled = false
    const rendered = renderSlideSource(deck[index] ?? '', preview.externalImages)
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
// blocks overflow the canvas reports its page count, and next/prev walk through
// its sub-pages before moving to the neighboring slide.
function usePresentationNav(deckLength: number) {
  const { index, goTo } = useDeckIndex(deckLength)
  const [subPage, setSubPage] = useState(0)
  const [pageCounts, setPageCounts] = useState<Record<number, number>>({})
  const pageCount = pageCounts[index] ?? 1
  useEffect(() => {
    setSubPage(0)
  }, [index])
  // A re-measure can shrink a slide back to fewer pages; clamping the state (not
  // just the rendered value) keeps every consumer on a page that exists.
  useEffect(() => {
    setSubPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])
  const registerPageCount = useCallback((slide: number, count: number) => {
    setPageCounts((current) => (current[slide] === count ? current : { ...current, [slide]: count }))
  }, [])
  const handlePageCount = useCallback((count: number) => registerPageCount(index, count), [index, registerPageCount])
  const sub = Math.min(Math.max(subPage, 0), pageCount - 1)
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
  const report = (scope: string) => (error: unknown) => console.debug(`[inkstone] ${scope} rejected`, error)
  const enter = useCallback(() => {
    const panel = panelRef.current
    if (!panel || document.fullscreenElement) return
    const pending = panel.requestFullscreen()
    pending.catch(report('fullscreen request'))
  }, [panelRef])
  const exit = useCallback(() => {
    if (!panelRef.current || document.fullscreenElement !== panelRef.current) return
    void document.exitFullscreen().catch(report('exit fullscreen'))
  }, [panelRef])
  // Starting the show enters fullscreen, and the request has to happen while the
  // click that opened the overlay is still a user gesture: a layout effect runs
  // inside that same task, a plain effect after it does not.
  useLayoutEffect(() => {
    if (open) enter()
  }, [open, enter])
  useEffect(() => {
    if (!open) return
    const owned = () => document.fullscreenElement === panelRef.current
    const sync = () => setIsFullscreen(owned())
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      // Leaving the show must not leave the browser holding the app fullscreen.
      if (owned()) exit()
    }
  }, [open, panelRef, exit])
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement === panelRef.current) exit()
    else enter()
  }, [enter, exit])
  return { isFullscreen, toggleFullscreen }
}
