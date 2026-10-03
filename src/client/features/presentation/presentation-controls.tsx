import { ChevronLeft, ChevronRight, Download, FileText, Images, LayoutGrid, Maximize, Minimize, PanelLeftClose, PanelLeftOpen, Presentation, Radio, Snowflake, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { IconButton, Spinner } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { presentationKeyCombo } from './presentation-keys'
import type { DeckExportProgress } from './deck-print'
import { describeDeckPosition, formatDeckPosition } from './deck-position'

export interface PresentationControlsProps {
  slideIndex: number
  slideCount: number
  subPage: number
  pageCount: number
  isFullscreen: boolean
  railOpen: boolean
  overview: boolean
  following: boolean
  /** The note behind the show was deleted; the deck holds its last snapshot and cannot follow. */
  followLost: boolean
  chromeHidden: boolean
  /** The pill is under the overview grid, so it cannot be reached from behind it. */
  occluded: boolean
  onPrev: () => void
  onNext: () => void
  onToggleRail: () => void
  onToggleOverview: () => void
  onToggleFollowing: () => void
  onToggleFullscreen: () => void
  onOpenPresenter: () => void
  /** An image export is being written right now; the control that starts it shows that on itself. */
  exporting: boolean
  onExport: () => void
  onExportImages: () => void
  onExportHandout: () => void
  onClose: () => void
}

export function PresentationControls({ slideIndex, slideCount, subPage, pageCount, isFullscreen, railOpen, overview, following, followLost, chromeHidden, occluded, exporting, onPrev, onNext, onToggleRail, onToggleOverview, onToggleFollowing, onToggleFullscreen, onOpenPresenter, onExport, onExportImages, onExportHandout, onClose }: PresentationControlsProps) {
  return (
    <div
      data-presentation-chrome
      inert={chromeHidden || occluded ? true : undefined}
      className={cn(
        'absolute bottom-[var(--sp-4)] left-1/2 flex -translate-x-1/2 items-center gap-[var(--sp-0\\.5)] rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] p-[var(--sp-1)] shadow-[var(--shadow-pop)]',
        'transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]',
        chromeHidden && 'pointer-events-none opacity-0 invisible',
      )}
    >
      <SlideStepper slideIndex={slideIndex} slideCount={slideCount} subPage={subPage} pageCount={pageCount} onPrev={onPrev} onNext={onNext} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <ViewControls railOpen={railOpen} overview={overview} following={following} followLost={followLost} isFullscreen={isFullscreen} onToggleRail={onToggleRail} onToggleOverview={onToggleOverview} onToggleFollowing={onToggleFollowing} onToggleFullscreen={onToggleFullscreen} onOpenPresenter={onOpenPresenter} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <ExportControls exporting={exporting} onExport={onExport} onExportImages={onExportImages} onExportHandout={onExportHandout} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Tooltip label={t('workspace.presentation_exit')} combo={presentationKeyCombo('exit')} side='top'>
        <IconButton label={t('workspace.presentation_exit')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

// The name this control owes the presenter: what the show is doing about the note, in the order the
// states matter. A deleted note keeps its last snapshot on the projector, so the freeze is the fact
// to report, and it outranks whether the show was set to follow.
function followControlLabel({ following, followLost }: { following: boolean; followLost: boolean }): string {
  if (followLost) return t('workspace.presentation_follow_lost')
  return following ? t('workspace.presentation_freeze') : t('workspace.presentation_follow')
}

function ViewControls({ railOpen, overview, following, followLost, isFullscreen, onToggleRail, onToggleOverview, onToggleFollowing, onToggleFullscreen, onOpenPresenter }: {
  railOpen: boolean
  overview: boolean
  following: boolean
  followLost: boolean
  isFullscreen: boolean
  onToggleRail: () => void
  onToggleOverview: () => void
  onToggleFollowing: () => void
  onToggleFullscreen: () => void
  onOpenPresenter: () => void
}) {
  const fullscreenLabel = isFullscreen ? t('workspace.presentation_exit_fullscreen') : t('workspace.presentation_fullscreen')
  const railLabel = railOpen ? t('workspace.presentation_hide_slides') : t('workspace.presentation_show_slides')
  const overviewLabel = overview ? t('workspace.presentation_hide_overview') : t('workspace.presentation_show_overview')
  const followLabel = followControlLabel({ following, followLost })
  const presenterLabel = t('workspace.presentation_presenter')
  return (
    <>
      <Tooltip label={railLabel} combo={presentationKeyCombo('slideList')} side='top'>
        <IconButton label={railLabel} size='sm' active={railOpen} onClick={onToggleRail}>
          {railOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={overviewLabel} combo={presentationKeyCombo('overview')} side='top'>
        <IconButton label={overviewLabel} size='sm' active={overview} onClick={onToggleOverview}>
          <LayoutGrid size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={presenterLabel} combo={presentationKeyCombo('presenter')} side='top'>
        <IconButton label={presenterLabel} size='sm' onClick={onOpenPresenter}>
          <Presentation size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={followLabel} combo={followLost ? undefined : presentationKeyCombo('follow')} side='top'>
        <IconButton label={followLabel} size='sm' data-follow-toggle='true' active={!followLost && following} disabled={followLost} onClick={onToggleFollowing}>
          {!followLost && following ? <Radio size={14} /> : <Snowflake size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={fullscreenLabel} combo={presentationKeyCombo('fullscreen')} side='top'>
        <IconButton label={fullscreenLabel} size='sm' onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </IconButton>
      </Tooltip>
    </>
  )
}

// The three exports are named without a keystroke beside them because the show binds no key to any of
// them: a tooltip that showed `?` here would point at the card, not at the press.
function ExportControls({ exporting, onExport, onExportImages, onExportHandout }: { exporting: boolean; onExport: () => void; onExportImages: () => void; onExportHandout: () => void }) {
  return (
    <>
      <Tooltip label={t('workspace.presentation_export')} side='top'>
        <IconButton label={t('workspace.presentation_export')} size='sm' onClick={onExport}>
          <Download size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_export_handout')} side='top'>
        <IconButton label={t('workspace.presentation_export_handout')} size='sm' onClick={onExportHandout}>
          <FileText size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_export_images')} side='top'>
        <IconButton label={t('workspace.presentation_export_images')} size='sm' onClick={onExportImages}>
          {/* The control that started the write carries the sign of it, so the presenter is not left
              depending on a floating layer's place in the stack to learn the press did anything. */}
          {exporting ? <span data-export-spinner aria-hidden='true' className='inline-flex'><Spinner size={14} /></span> : <Images size={14} />}
        </IconButton>
      </Tooltip>
    </>
  )
}

// What the image export is doing, painted by the show itself. The sheet it counts is laid out
// off-screen, so a status layer held beside that sheet sits under the projector — the same paint-stack
// mistake the laser pointer and the screen cover were pulled back from. `--z-toast` is the token for
// "above the surface it belongs to", which is what a progress note has to be to be worth reading.
export function DeckExportProgress({ current, total }: DeckExportProgress) {
  return (
    <div
      data-export-progress
      role='status'
      aria-live='polite'
      className='pointer-events-none absolute bottom-[var(--sp-12)] left-1/2 z-[var(--z-toast)] -translate-x-1/2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-overlay)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-13)] text-[var(--text-primary)] shadow-[var(--shadow-soft)]'
    >
      {t('workspace.presentation_exporting_images', { value0: current, value1: total })}
    </div>
  )
}

// The deck position is one string with both numbers in it, printed left of the step buttons and read
// out by one announcement beside it. The digits are hidden from the accessibility tree on purpose: a
// screen reader hearing «3 / 14» and «2/4» as two live regions learns nothing about which is which.
function SlideStepper({ slideIndex, slideCount, subPage, pageCount, onPrev, onNext }: {
  slideIndex: number
  slideCount: number
  subPage: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
}) {
  const position = { index: slideIndex, count: slideCount, subPage, pageCount }
  return (
    <>
      <span
        data-deck-position
        aria-hidden='true'
        title={describeDeckPosition(position)}
        className='tabular min-w-[var(--sp-16)] px-[var(--sp-1)] text-center text-[length:var(--text-12)] text-[var(--text-secondary)]'
      >
        {formatDeckPosition(position)}
      </span>
      <span className='sr-only' role='status' aria-live='polite'>{describeDeckPosition(position)}</span>
      <Tooltip label={t('workspace.presentation_prev')} combo={presentationKeyCombo('prev')} side='top'>
        <IconButton label={t('workspace.presentation_prev')} size='sm' onClick={onPrev} disabled={slideIndex === 0 && subPage === 0}>
          <ChevronLeft size={15} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_next')} combo={presentationKeyCombo('next')} side='top'>
        <IconButton label={t('workspace.presentation_next')} size='sm' onClick={onNext} disabled={slideIndex === slideCount - 1 && subPage === pageCount - 1}>
          <ChevronRight size={15} />
        </IconButton>
      </Tooltip>
    </>
  )
}

// How much of the show has been reached. It counts the pages the deck measures rather than the slides
// the author wrote, so a one-slide note that paginates into fourteen is not drawn finished before it
// has been turned. Decoration: the position itself is announced by the pill, not by this bar.
export function SlideProgress({ page, pageTotal }: { page: number; pageTotal: number }) {
  return (
    <div
      className='pointer-events-none absolute inset-x-0 bottom-0 h-[var(--sp-0\\.5)] bg-[var(--border-subtle)]'
      aria-hidden='true'
    >
      <div data-slide-progress className='h-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]' style={{ width: `${Math.round((page / pageTotal) * 100)}%` }} />
    </div>
  )
}
