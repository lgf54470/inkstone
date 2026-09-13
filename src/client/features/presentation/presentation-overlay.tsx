import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { useBreakpoint, useDebounced } from '../../lib/hooks'
import { t } from '../../lib/i18n'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { enhancePreview } from '../../lib/markdown/enhance'
import { useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { useNotes } from '../../store/notes'
import { usePresentation } from '../../store/presentation'
import { useSession } from '../../store/session'
import { presentedNoteContent, railOpenFor } from './presentation-state'
import { useIsDarkTheme } from './presentation-theme'
import { PresentationControls, SlideProgress } from './presentation-controls'
import { SlideViewport } from './slide-canvas'
import { hashContent, readSlideHtml, rememberSlideHtml, renderSlideSource, slideCacheKey } from './slide-html'
import { SlideRail } from './slide-rail'
import { useStageMetrics, type StageMetrics } from './slide-stage'
import { splitIntoSlides } from './slides'
import { usePresentationKeys } from './use-presentation-keys'

const CHROME_IDLE_MS = 2600
// Followed edits land on the projector, but a re-split per keystroke would remount
// the deck under the presenter: one debounce also coalesces a sync burst.
const FOLLOW_DEBOUNCE_MS = 400

// The show reads its own store, which the shell hosts: that is what keeps a talk
// alive across the layout switch that unmounts the workspace it started from.
export function PresentationOverlay() {
  const open = usePresentation((s) => s.open)
  const noteId = usePresentation((s) => s.noteId)
  const snapshot = usePresentation((s) => s.snapshot)
  const following = usePresentation((s) => s.following)
  const storedTitle = usePresentation((s) => s.title)
  const onClose = usePresentation((s) => s.stop)
  const panelRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const session = usePresentationSession({ open, noteId, snapshot, following, storedTitle, panelRef, stageRef, onClose })

  if (!open) return null

  return createPortal(<PresentationDialog panelRef={panelRef} stageRef={stageRef} session={session} onClose={onClose} />, document.body)
}

// The slide surface itself: the list, the canvas and the controls are one dialog so
// the focus trap, the idle fade and the portal all belong to a single element.
function PresentationDialog({ panelRef, stageRef, session, onClose }: {
  panelRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  session: PresentationSession
  onClose: () => void
}) {
  return (
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
          title={session.noteTitle}
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
        following={session.following}
        chromeHidden={session.chromeHidden}
        onPrev={session.goPrev}
        onNext={session.goNext}
        onToggleRail={session.toggleRail}
        onToggleFollowing={session.toggleFollowing}
        onToggleFullscreen={session.toggleFullscreen}
        onClose={onClose}
      />
      <SlideProgress index={session.index} count={session.deck.length} chromeHidden={session.chromeHidden} />
    </div>
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
  following: boolean
  chromeHidden: boolean
  isFullscreen: boolean
  metrics: StageMetrics
  proseFont: ProseFont
  externalImages: boolean
  noteTitle: string
  handlePageCount: (count: number) => void
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  toggleFullscreen: () => void
  toggleRail: () => void
  toggleFollowing: () => void
}

function usePresentationSession({ open, noteId, snapshot, following, storedTitle, panelRef, stageRef, onClose }: {
  open: boolean
  noteId: string | null
  snapshot: string
  following: boolean
  storedTitle: string
  panelRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}): PresentationSession {
  const liveContent = useNotes((s) => (noteId ? s.contents[noteId] : undefined))
  const noteExists = useNotes((s) => Boolean(noteId && s.notes[noteId]))
  const liveTitle = useNotes((s) => (noteId ? s.notes[noteId]?.title : undefined))
  const debouncedContent = useDebounced(liveContent ?? '', FOLLOW_DEBOUNCE_MS)
  const presentedContent = presentedNoteContent({
    following,
    snapshot,
    live: liveContent === undefined ? undefined : debouncedContent,
    noteExists,
  })
  const { deck, fingerprint } = useShowDeck(presentedContent)
  useCapturePresented(open, following, presentedContent)
  const dark = useIsDarkTheme()
  const externalImages = useSession((s) => s.settings.preview.externalImages)
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const { index, sub, pageCount, handlePageCount, goNext, goPrev, jumpTo } = usePresentationNav(deck.length)
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(open, panelRef)
  const metrics = useStageMetrics(open, stageRef)
  const { railOpen, toggleRail } = useSlideList(open)
  const chromeHidden = useChromeAutoHide(open && isFullscreen)
  const toggleFollowing = useCallback(() => usePresentation.getState().setFollowing(!following), [following])
  const noteTitle = liveTitle ?? storedTitle
  const cacheKeys = useMemo(() => deck.map((_, item) => slideCacheKey(fingerprint, dark, item)), [deck, fingerprint, dark])
  useDialogBehavior(open, panelRef, onClose)
  useSlideHtml({ open, deck, index, fingerprint, content: presentedContent, noteTitle, dark })
  usePresentationKeys({ open, slideCount: deck.length, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail, toggleFollowing })
  return {
    deck,
    cacheKeys,
    index,
    sub,
    pageCount,
    railOpen,
    following,
    chromeHidden,
    isFullscreen,
    metrics,
    proseFont,
    externalImages,
    noteTitle,
    handlePageCount,
    goNext,
    goPrev,
    jumpTo,
    toggleFullscreen,
    toggleRail,
    toggleFollowing,
  }
}

// The overlay outlives a single show now that the shell hosts it, so the list follows
// the viewport instead of a value frozen at app start: it is open on screens with room
// for it, and an explicit toggle during the show wins until the next show opens.
function useSlideList(open: boolean): { railOpen: boolean; toggleRail: () => void } {
  const [choice, setChoice] = useState<boolean | null>(null)
  const fitsViewport = useBreakpoint() !== 'mobile'
  useLayoutEffect(() => {
    if (open) setChoice(null)
  }, [open])
  const railOpen = railOpenFor(choice, fitsViewport)
  const toggleRail = useCallback(() => setChoice(!railOpen), [railOpen])
  return { railOpen, toggleRail }
}

// The dialog's own browser contracts: Escape closes, the page behind stops scrolling,
// and focus stays inside the dialog until it goes back to whatever opened it.
function useDialogBehavior(open: boolean, panelRef: RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef, panelRef)
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

// The deck is exactly what the show presents: while following, every debounced edit
// re-splits it; a frozen snapshot is a plain string that cannot move under the
// presenter.
function useShowDeck(presentedContent: string) {
  const deck = useMemo(() => splitIntoSlides(presentedContent), [presentedContent])
  const fingerprint = useMemo(() => hashContent(presentedContent), [presentedContent])
  return { deck, fingerprint }
}

// Following keeps the store's snapshot equal to what is on screen: freezing then
// pins exactly that, and a note that disappears mid-talk still has a last-seen deck
// to fall back to.
function useCapturePresented(open: boolean, following: boolean, presentedContent: string): void {
  useEffect(() => {
    if (open && following) usePresentation.getState().capture(presentedContent)
  }, [open, following, presentedContent])
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
