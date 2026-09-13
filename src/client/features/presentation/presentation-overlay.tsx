import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ProseFont } from '@shared/types'
import { useBreakpoint, useDebounced } from '../../lib/hooks'
import { t } from '../../lib/i18n'
import { useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { buildDeckPages, DeckPrintSheet } from './deck-print'
import { useNotes } from '../../store/notes'
import { usePresentation } from '../../store/presentation'
import { useSession } from '../../store/session'
import { presentedNoteContent, railOpenFor } from './presentation-state'
import { useIsDarkTheme } from './presentation-theme'
import { PresentationControls, SlideProgress, type PresentationControlsProps } from './presentation-controls'
import { SlideViewport } from './slide-canvas'
import { hashContent, slideCacheKey } from './slide-html'
import { samePlan, type SlidePlan } from './slide-pagination'
import { SlidePreflight, type SlidePreflightProps } from './slide-preflight'
import { SlideRail } from './slide-rail'
import { useStageMetrics, type StageMetrics } from './slide-stage'
import { splitIntoSlides } from './slides'
import { usePresentationKeys } from './use-presentation-keys'
import { useSlideHtml } from './use-slide-html'

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
    <>
      <div
        ref={panelRef}
        tabIndex={-1}
        role='dialog'
        data-slide-list-complete={session.listComplete ? 'true' : 'false'}
        aria-modal='true'
        aria-label={t('workspace.presentation_mode')}
        className='anim-fade fixed inset-0 z-[var(--z-modal)] flex overflow-hidden bg-[var(--bg-base)] outline-none'
      >
        {session.railOpen && (
          <SlideRail
            deck={session.deck}
            cacheKeys={session.cacheKeys}
            plans={session.plans}
            index={session.index}
            sub={session.sub}
            designWidth={session.metrics.designWidth}
            designHeight={session.metrics.designHeight}
            title={session.noteTitle}
            externalImages={session.externalImages}
            proseFont={session.proseFont}
            chromeHidden={session.chromeHidden}
            onSelectPage={session.jumpToPage}
          />
        )}
        <PresentationStage stageRef={stageRef} session={session} />
        <PresentationControls {...controlProps(session, onClose)} />
        <SlideProgress index={session.index} count={session.deck.length} chromeHidden={session.chromeHidden} />
      </div>
      {/* The whole deck is measured off-screen while the show is open, so the slide
          list lists every page from the start instead of only the slides visited. */}
      <SlidePreflight {...session.preflight} />
      {session.print && (
        <DeckPrintSheet pages={session.print.pages} metrics={session.print.metrics} font={session.proseFont} onDone={session.print.done} />
      )}
    </>
  )
}

// The controls read the session's position and toggles as flat props, so mapping them in
// one place keeps the dialog's markup about the slide surface rather than about plumbing.
function controlProps(session: PresentationSession, onClose: () => void): PresentationControlsProps {
  return {
    slideIndex: session.index,
    slideCount: session.deck.length,
    subPage: session.sub,
    pageCount: session.pageCount,
    isFullscreen: session.isFullscreen,
    railOpen: session.railOpen,
    following: session.following,
    chromeHidden: session.chromeHidden,
    onPrev: session.goPrev,
    onNext: session.goNext,
    onToggleRail: session.toggleRail,
    onToggleFollowing: session.toggleFollowing,
    onToggleFullscreen: session.toggleFullscreen,
    onExport: session.exportDeck,
    onClose,
  }
}

function PresentationStage({ stageRef, session }: { stageRef: RefObject<HTMLDivElement | null>; session: PresentationSession }) {
  return (
    <div ref={stageRef} className='relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden'>
      <SlideViewport
        metrics={session.metrics}
        cacheKey={session.cacheKeys[session.index] ?? ''}
        source={session.deck[session.index] ?? ''}
        subPage={session.sub}
        onPlan={session.handlePlan}
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
  /** Page layout measured per slide, the slide list's page list and the counter's totals. */
  plans: Record<number, SlidePlan>
  handlePlan: (plan: SlidePlan) => void
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  jumpToPage: (index: number, sub: number) => void
  toggleFullscreen: () => void
  toggleRail: () => void
  toggleFollowing: () => void
  /** False while the idle pass is still listing pages the deck has not shown yet. */
  listComplete: boolean
  /** Builds the printable deck; the sheet appears until the print dialog is done with it. */
  exportDeck: () => void
  print: { pages: string[]; metrics: StageMetrics; done: () => void } | null
  /** Everything the idle deck-measuring pass needs, grouped so the dialog can spread it. */
  preflight: SlidePreflightProps
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
  const { content: presentedContent, title: liveTitle } = usePresentedContent({ open, noteId, snapshot, following })
  const { deck, fingerprint } = useShowDeck(presentedContent)
  useCapturePresented(open, following, presentedContent)
  const { dark, externalImages, proseFont } = useShowSettings()
  const nav = usePresentationNav(deck.length, fingerprint)
  const { index, sub, pageCount, plans, handlePlan, goNext, goPrev, jumpTo, jumpToPage } = nav
  const { isFullscreen, toggleFullscreen } = useFullscreenToggle(open, panelRef)
  const metrics = useStageMetrics(open, stageRef)
  const { railOpen, toggleRail } = useSlideList(open)
  const chromeHidden = useChromeAutoHide(open && isFullscreen)
  const toggleFollowing = useCallback(() => usePresentation.getState().setFollowing(!following), [following])
  const noteTitle = liveTitle ?? storedTitle
  const cacheKeys = useMemo(() => deck.map((_, item) => slideCacheKey(fingerprint, dark, item)), [deck, fingerprint, dark])
  const print = useDeckPrint({ deck, cacheKeys, plans, metrics, externalImages })
  const { listComplete, onFinished } = useListComplete()
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
    plans,
    handlePlan,
    goNext,
    goPrev,
    jumpTo,
    jumpToPage,
    toggleFullscreen,
    toggleRail,
    toggleFollowing,
    exportDeck: print.exportDeck,
    print: print.sheet,
    preflight: { deck, cacheKeys, fingerprint, metrics, content: presentedContent, noteTitle, onPlan: nav.reportPlan, onFinished },
    listComplete,
  }
}

// Whether the idle pass has listed every page the deck has. It is state rather than a guess about
// whether the list happens to be growing, because a slice that is still measuring looks identical
// to a finished pass from the outside; the dialog carries it as markup so it is observable.
function useListComplete(): { listComplete: boolean; onFinished: (finished: boolean) => void } {
  const [listComplete, setListComplete] = useState(false)
  const onFinished = useCallback((finished: boolean) => setListComplete(finished), [])
  return { listComplete, onFinished }
}

// Exporting the deck is a print: the sheet is built from the measured plans and the prepared
// markup, mounted for as long as the dialog needs it, and torn down when printing is over. The
// pages are only built when someone asks for them, because slicing the whole deck is not work
// the show should do on the chance that it is exported.
function useDeckPrint({ deck, cacheKeys, plans, metrics, externalImages }: {
  deck: string[]
  cacheKeys: string[]
  plans: Record<number, SlidePlan>
  metrics: StageMetrics
  externalImages: boolean
}): { exportDeck: () => void; sheet: PresentationSession['print'] } {
  const [pages, setPages] = useState<string[] | null>(null)
  const exportDeck = useCallback(() => setPages(buildDeckPages(deck, cacheKeys, plans, metrics, externalImages)), [deck, cacheKeys, plans, metrics, externalImages])
  const done = useCallback(() => setPages(null), [])
  return { exportDeck, sheet: pages ? { pages, metrics, done } : null }
}

// What the show puts on screen: the note body while following, the frozen copy while
// frozen. The debounce coalesces a burst of keystrokes into a single re-split of the deck,
// and the note id keys it so a show that opens presents the deck the note has now instead
// of replaying what the closed overlay was holding — which was an empty deck, so the slide
// list showed one page until the real deck arrived.
function usePresentedContent({ open, noteId, snapshot, following }: {
  open: boolean
  noteId: string | null
  snapshot: string
  following: boolean
}): { content: string; title: string | undefined } {
  const { content: live, title, exists } = useLiveNote(noteId)
  const debounced = useDebounced(live ?? '', FOLLOW_DEBOUNCE_MS, open ? noteId : null)
  const content = presentedNoteContent({ following, snapshot, live: live === undefined ? undefined : debounced, noteExists: exists })
  return { content, title }
}

// The show reads the note it follows straight from the store instead of taking a copy
// at start, so an edit from another tab, device or MCP write reaches the projector.
function useLiveNote(noteId: string | null) {
  const content = useNotes((s) => (noteId ? s.contents[noteId] : undefined))
  const title = useNotes((s) => (noteId ? s.notes[noteId]?.title : undefined))
  const exists = useNotes((s) => Boolean(noteId && s.notes[noteId]))
  return { content, title, exists }
}

// Presentation typography follows the reader's settings, so the projector looks like
// the preview the deck was written against.
function useShowSettings() {
  const dark = useIsDarkTheme()
  const externalImages = useSession((s) => s.settings.preview.externalImages)
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  return { dark, externalImages, proseFont }
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
function useDeckIndex(deckLength: number) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    setIndex((current) => Math.min(current, deckLength - 1))
  }, [deckLength])
  const goTo = useCallback((next: number) => setIndex(Math.max(0, Math.min(next, deckLength - 1))), [deckLength])
  return { index, goTo }
}

// Slide-level position plus auto-pagination sub-pages: a slide whose rendered
// blocks overflow the canvas reports its page plan, and next/prev walk through its
// sub-pages before moving to the neighboring slide. The plans also drive the slide
// list, which is why the show keeps them instead of only the current page count.
function usePresentationNav(deckLength: number, fingerprint: string) {
  const { index, goTo } = useDeckIndex(deckLength)
  const { plans, reportPlan } = useSlidePlans(fingerprint)
  const currentPlan = plans[index]
  const pageCount = currentPlan?.pages.length ?? 1
  const { sub, setSubPage, carryPage } = useSubPage(index, pageCount, Boolean(currentPlan))
  const handlePlan = useCallback((plan: SlidePlan) => reportPlan(index, plan), [index, reportPlan])
  const goNext = useCallback(() => {
    if (sub < pageCount - 1) setSubPage(sub + 1)
    else if (index < deckLength - 1) {
      carryPage(0)
      goTo(index + 1)
    }
  }, [sub, pageCount, index, deckLength, goTo, carryPage, setSubPage])
  const goPrev = useCallback(() => {
    if (sub > 0) setSubPage(sub - 1)
    else if (index > 0) {
      carryPage(0)
      goTo(index - 1)
    }
  }, [sub, index, goTo, carryPage, setSubPage])
  const jumpTo = useCallback((slide: number) => {
    carryPage(0)
    goTo(slide)
  }, [goTo, carryPage])
  // The slide list lists pages, so a click lands on the exact page it shows rather
  // than the top of the slide that contains it.
  const jumpToPage = useCallback((slide: number, page: number) => {
    const target = Math.max(page, 0)
    if (slide === index) setSubPage(target)
    else {
      carryPage(target)
      goTo(slide)
    }
  }, [goTo, index, carryPage, setSubPage])
  return { index, sub, pageCount, plans, handlePlan, reportPlan, goNext, goPrev, jumpTo, jumpToPage }
}

// Page plans live in one map because the show and the slide list both read them: the
// canvas measures the slide it renders and the list turns those measurements into pages.
function useSlidePlans(fingerprint: string) {
  const [plans, setPlans] = useState<Record<number, SlidePlan>>({})
  // Edited content re-splits the deck, so plans measured for the previous text would
  // describe pages that no longer exist.
  useEffect(() => {
    setPlans({})
  }, [fingerprint])
  const reportPlan = useCallback((slide: number, plan: SlidePlan) => {
    setPlans((current) => (samePlan(current[slide], plan) ? current : { ...current, [slide]: plan }))
  }, [])
  return { plans, reportPlan }
}

// The page inside the current slide: entering a slide starts at its top, while a jump
// from the slide list carries the page it named across the slide change, and a
// re-measure that shrank the slide pulls the state back onto a page that exists.
// Clamping waits for a known plan: an edit mid-talk re-splits the deck, and a clamp
// against the "one page" a missing plan implies would bounce the presenter to the top
// of the slide on every unrelated write.
function useSubPage(index: number, pageCount: number, known: boolean) {
  const [subPage, setSubPage] = useState(0)
  const pending = useRef<number | null>(null)
  useEffect(() => {
    const target = pending.current
    pending.current = null
    setSubPage(target ?? 0)
  }, [index])
  useEffect(() => {
    if (!known) return
    setSubPage((current) => Math.min(current, pageCount - 1))
  }, [known, pageCount])
  const carryPage = useCallback((page: number) => {
    pending.current = page
  }, [])
  return { sub: Math.min(Math.max(subPage, 0), pageCount - 1), setSubPage, carryPage }
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
