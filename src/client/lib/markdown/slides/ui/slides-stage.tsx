import { memo, type MouseEvent as ReactMouseEvent } from 'react'
import type { PageSize } from '../page'
import type { Slide, SlideElement, SlidesTheme } from '../types'
import { elementIdAt } from './canvas-helpers'
import { SlidesCanvas } from './slides-canvas'
import { t } from '../../../i18n'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1
/** What a page is drawn at when nothing has been asked for. */
const RESET_ZOOM = 1

/** Rounds away the float noise a repeated ±0.1 leaves behind, so the label reads 110% not 110.00000000000001%. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  const next = Number((zoom + direction * ZOOM_STEP).toFixed(1))
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

/** The zoom a command asks for, which is the same step the corner controls take. */
export function zoomCommand(zoom: number, command: 'in' | 'out' | 'reset'): number {
  if (command === 'reset') return RESET_ZOOM
  return steppedZoom(zoom, command === 'in' ? 1 : -1)
}

interface SlidesStageProps {
  slide: Slide | undefined
  theme: SlidesTheme
  page: PageSize
  zoom: number
  activeElementId: string | null
  editingElementId: string | null
  assets?: Record<string, string>
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onZoom: (zoom: number) => void
  onStartSlideshow: () => void
  onContextMenuAt: (elementId: string | null, event: ReactMouseEvent<HTMLElement>) => void
  onStartTyping: (elementId: string) => void
}

/**
 * The stage the deck is edited on: the active page at authoring scale, the corner controls that
 * show it or fit it back, and the pointer gestures the page itself owns.
 *
 * What the page *is* and what an edit to it *means* are two questions, so they live apart: this
 * file reads the pointer, the page size and the zoom, and hands every intent to the shell as a
 * callback. Nothing here reaches for the document.
 */
export const SlidesStage = memo(function SlidesStage({
  slide,
  theme,
  page,
  zoom,
  activeElementId,
  editingElementId,
  assets,
  onSelectElement,
  onUpdateElement,
  onZoom,
  onStartSlideshow,
  onContextMenuAt,
  onStartTyping,
}: SlidesStageProps) {
  return (
    <main
      className='bento-canvas-stage flex flex-1 items-center justify-center overflow-auto p-8 relative'
      onContextMenu={(event) => onContextMenuAt(elementIdAt(event.target), event)}
      onDoubleClick={(event) => {
        const elementId = elementIdAt(event.target)
        if (elementId) onStartTyping(elementId)
      }}
    >
      {slide && (
        <div
          style={{ width: `${page.width * zoom}px`, height: `${page.height * zoom}px` }}
          className='relative shrink-0'
        >
          <SlidesCanvas
            slide={slide}
            theme={theme}
            page={page}
            scale={zoom}
            editable={true}
            activeElementId={activeElementId}
            editingElementId={editingElementId}
            assets={assets}
            onSelectElement={onSelectElement}
            onUpdateElement={onUpdateElement}
          />
        </div>
      )}

      <StageControls zoom={zoom} onZoom={onZoom} onStartSlideshow={onStartSlideshow} />
    </main>
  )
})

/** The corner cluster: start the show, or fit the page by a step at a time. */
function StageControls({
  zoom,
  onZoom,
  onStartSlideshow,
}: {
  zoom: number
  onZoom: (zoom: number) => void
  onStartSlideshow: () => void
}) {
  return (
    <div className='bento-corner-controls'>
      <div className='bento-zoom-cluster flex items-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5 shadow-md gap-1'>
        <button
          type='button'
          onClick={onStartSlideshow}
          className='flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors'
          title={t('slides.slideshow')}
        >
          <span className='text-[length:var(--text-10)]'>▶</span>
          <span>{t('slides.slideshow')}</span>
        </button>

        <span className='h-3.5 w-px bg-[var(--border-subtle)]' />

        <button
          type='button'
          onClick={() => onZoom(steppedZoom(zoom, -1))}
          className='bento-zoom-btn'
          title={t('common.zoom_out')}
        >
          −
        </button>
        <button
          type='button'
          onClick={() => onZoom(1)}
          className='bento-zoom-label hover:text-[var(--text-primary)] cursor-pointer'
          title={t('slides.reset_zoom')}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type='button'
          onClick={() => onZoom(steppedZoom(zoom, 1))}
          className='bento-zoom-btn'
          title={t('common.zoom_in')}
        >
          +
        </button>
      </div>
    </div>
  )
}
