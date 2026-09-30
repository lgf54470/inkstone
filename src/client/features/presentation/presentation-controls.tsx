import { ChevronLeft, ChevronRight, Download, Images, Maximize, Minimize, PanelLeftClose, PanelLeftOpen, Radio, Snowflake, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'

export interface PresentationControlsProps {
  slideIndex: number
  slideCount: number
  subPage: number
  pageCount: number
  isFullscreen: boolean
  railOpen: boolean
  following: boolean
  chromeHidden: boolean
  onPrev: () => void
  onNext: () => void
  onToggleRail: () => void
  onToggleFollowing: () => void
  onToggleFullscreen: () => void
  onExport: () => void
  onExportImages: () => void
  onClose: () => void
}

export function PresentationControls({ slideIndex, slideCount, subPage, pageCount, isFullscreen, railOpen, following, chromeHidden, onPrev, onNext, onToggleRail, onToggleFollowing, onToggleFullscreen, onExport, onExportImages, onClose }: PresentationControlsProps) {
  return (
    <div
      data-presentation-chrome
      inert={chromeHidden ? true : undefined}
      className={cn(
        'absolute bottom-[var(--sp-4)] left-1/2 flex -translate-x-1/2 items-center gap-[var(--sp-0\\.5)] rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] p-[var(--sp-1)] shadow-[var(--shadow-pop)]',
        'transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)]',
        chromeHidden && 'pointer-events-none opacity-0 invisible',
      )}
    >
      <SlideStepper slideIndex={slideIndex} slideCount={slideCount} subPage={subPage} pageCount={pageCount} onPrev={onPrev} onNext={onNext} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <ViewControls railOpen={railOpen} following={following} isFullscreen={isFullscreen} onToggleRail={onToggleRail} onToggleFollowing={onToggleFollowing} onToggleFullscreen={onToggleFullscreen} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <ExportControls onExport={onExport} onExportImages={onExportImages} />
      <span className='mx-[var(--sp-1)] h-[var(--sp-4)] w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Tooltip label={t('workspace.presentation_exit')} side='top'>
        <IconButton label={t('workspace.presentation_exit')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function ViewControls({ railOpen, following, isFullscreen, onToggleRail, onToggleFollowing, onToggleFullscreen }: {
  railOpen: boolean
  following: boolean
  isFullscreen: boolean
  onToggleRail: () => void
  onToggleFollowing: () => void
  onToggleFullscreen: () => void
}) {
  const fullscreenLabel = isFullscreen ? t('workspace.presentation_exit_fullscreen') : t('workspace.presentation_fullscreen')
  const railLabel = railOpen ? t('workspace.presentation_hide_slides') : t('workspace.presentation_show_slides')
  const followLabel = following ? t('workspace.presentation_freeze') : t('workspace.presentation_follow')
  return (
    <>
      <Tooltip label={railLabel} side='top'>
        <IconButton label={railLabel} size='sm' active={railOpen} onClick={onToggleRail}>
          {railOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={followLabel} side='top'>
        <IconButton label={followLabel} size='sm' active={following} onClick={onToggleFollowing}>
          {following ? <Radio size={14} /> : <Snowflake size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={fullscreenLabel} side='top'>
        <IconButton label={fullscreenLabel} size='sm' onClick={onToggleFullscreen}>
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </IconButton>
      </Tooltip>
    </>
  )
}

function ExportControls({ onExport, onExportImages }: { onExport: () => void; onExportImages: () => void }) {
  return (
    <>
      <Tooltip label={t('workspace.presentation_export')} side='top'>
        <IconButton label={t('workspace.presentation_export')} size='sm' onClick={onExport}>
          <Download size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('workspace.presentation_export_images')} side='top'>
        <IconButton label={t('workspace.presentation_export_images')} size='sm' onClick={onExportImages}>
          <Images size={14} />
        </IconButton>
      </Tooltip>
    </>
  )
}

// The deck position is the slide number; a slide that spans several pages shows
// its sub-page as a separate chip so "3.2 / 14" can never be misread as a slide.
function SlideStepper({ slideIndex, slideCount, subPage, pageCount, onPrev, onNext }: {
  slideIndex: number
  slideCount: number
  subPage: number
  pageCount: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <>
      <Tooltip label={t('workspace.presentation_prev')} side='top'>
        <IconButton label={t('workspace.presentation_prev')} size='sm' onClick={onPrev} disabled={slideIndex === 0 && subPage === 0}>
          <ChevronLeft size={15} />
        </IconButton>
      </Tooltip>
      <span aria-live='polite' className='tabular min-w-14 text-center text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {slideIndex + 1} / {slideCount}
      </span>
      <Tooltip label={t('workspace.presentation_next')} side='top'>
        <IconButton label={t('workspace.presentation_next')} size='sm' onClick={onNext} disabled={slideIndex === slideCount - 1 && subPage === pageCount - 1}>
          <ChevronRight size={15} />
        </IconButton>
      </Tooltip>
      {pageCount > 1 && (
        <span
          aria-live='polite'
          className='tabular mr-[var(--sp-1)] rounded-[var(--r-full)] bg-[var(--accent-soft)] px-[var(--sp-2)] py-[var(--sp-0\\.5)] text-[length:var(--text-11)] text-[var(--accent)]'
          title={t('workspace.presentation_page_of', { value0: subPage + 1, value1: pageCount })}
        >
          {subPage + 1}/{pageCount}
        </span>
      )}
    </>
  )
}

export function SlideProgress({ index, count, chromeHidden: _chromeHidden }: { index: number; count: number; chromeHidden?: boolean }) {
  return (
    <div
      className='pointer-events-none absolute inset-x-0 bottom-0 h-[var(--sp-0\\.5)] bg-[var(--border-subtle)]'
      aria-hidden='true'
    >
      <div className='h-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]' style={{ width: `${Math.round(((index + 1) / count) * 100)}%` }} />
    </div>
  )
}
