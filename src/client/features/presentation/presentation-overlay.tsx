import { useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { usePresentation } from '../../store/presentation'
import { DeckImageSheet, DeckPrintSheet } from './deck-print'
import { PresentationControls, SlideProgress, type PresentationControlsProps } from './presentation-controls'
import { PresentationStage, ScreenCover, stageProps } from './presentation-stage'
import { LaserPointer } from './presentation-pointer'
import { SlidePreflight } from './slide-preflight'
import { SlideOverviewGrid } from './slide-overview-grid'
import { SlideRail } from './slide-rail'
import { type PresentationSession, usePresentationSession } from './use-presentation-session'

// The show reads its own store, which the shell hosts: that is what keeps a talk
// alive across the layout switch that unmounts the workspace it started from.
export function PresentationOverlay() {
  const open = usePresentation((s) => s.open)
  const noteId = usePresentation((s) => s.noteId)
  const snapshot = usePresentation((s) => s.snapshot)
  const following = usePresentation((s) => s.following)
  const storedTitle = usePresentation((s) => s.title)
  const initialSlideIndex = usePresentation((s) => s.initialSlideIndex)
  const onClose = usePresentation((s) => s.stop)
  const panelRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const session = usePresentationSession({ open, noteId, snapshot, following, storedTitle, panelRef, stageRef, onClose, initialSlideIndex })

  if (!open) return null

  return createPortal(<PresentationDialog panelRef={panelRef} stageRef={stageRef} session={session} onClose={onClose} />, document.body)
}

// The slide surface itself: the list, the canvas, the controls and the overview are one dialog so
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
        data-slide-list-complete={session.listProgress.finished ? 'true' : 'false'}
        // Rasterizing a deck takes a beat per page, and the export says nothing until it lands: the
        // busy state is what tells a screen reader that the deck is being written out.
        aria-busy={session.images ? 'true' : undefined}
        aria-modal='true'
        aria-label={t('workspace.presentation_mode')}
        data-surface='presentation'
        className={cn('anim-fade fixed inset-0 z-[var(--z-modal)] flex overflow-hidden bg-[var(--bg-base)] outline-none', session.laser && 'cursor-none')}
      >
        {session.railOpen && <SlideRail {...slideSurfaceProps(session)} title={session.noteTitle} progress={session.listProgress} chromeHidden={session.chromeHidden} occluded={session.occluded} />}
        <PresentationStage {...stageProps(stageRef, session)} />
        <PresentationControls {...controlProps(session, onClose)} />
        <SlideProgress index={session.index} count={session.deck.length} />
        {session.overview && <SlideOverviewGrid {...slideSurfaceProps(session)} onClose={session.clearOverview} />}
        {session.screenCover && <ScreenCover cover={session.screenCover} onClear={session.clearCover} />}
        {/* Inside the dialog rather than beside it: the panel owns the paint stack, and a pointer
            drawn outside it would sit under the very slide it is meant to point at. */}
        <LaserPointer active={session.laser} />
      </div>
      <PresentationSheets session={session} />
    </>
  )
}

function PresentationSheets({ session }: { session: PresentationSession }) {
  return (
    <>
      {/* The whole deck is measured off-screen while the show is open, so the slide
          list lists every page from the start instead of only the slides visited. */}
      <SlidePreflight {...session.preflight} />
      {session.print && (
        <DeckPrintSheet pages={session.print.pages} metrics={session.print.metrics} font={session.proseFont} dark={session.print.dark} onDone={session.print.done} />
      )}
      {session.images && (
        <DeckImageSheet pages={session.images.pages} metrics={session.images.metrics} font={session.proseFont} dark={session.images.dark} title={session.images.title} onDone={session.images.done} />
      )}
    </>
  )
}

// The page list and the overview grid draw the same thing — every page of the deck, at a scale —
// so they read the deck, the plans and the design canvas from one mapper. Both surfaces are fed by
// the session's flat props for the same reason the controls are: the dialog's markup stays about
// the slide surface rather than about plumbing.
function slideSurfaceProps(session: PresentationSession) {
  return {
    deck: session.deck,
    cacheKeys: session.cacheKeys,
    plans: session.plans,
    index: session.index,
    sub: session.sub,
    designWidth: session.metrics.designWidth,
    designHeight: session.metrics.designHeight,
    externalImages: session.externalImages,
    proseFont: session.proseFont,
    onSelectPage: session.jumpToPage,
  }
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
    overview: session.overview,
    following: session.following,
    chromeHidden: session.chromeHidden,
    occluded: session.occluded,
    onPrev: session.goPrev,
    onNext: session.goNext,
    onToggleRail: session.toggleRail,
    onToggleOverview: session.toggleOverview,
    onToggleFollowing: session.toggleFollowing,
    onToggleFullscreen: session.toggleFullscreen,
    onOpenPresenter: session.openPresenter,
    onExport: session.exportDeck,
    onExportImages: session.exportImages,
    onClose,
  }
}
