import { memo, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { ElementPosition } from '../edits'
import { fitPageScale, type PageSize } from '../page'
import type { Slide, SlideElement, SlidesTheme } from '../types'
import { elementIdAt } from './canvas-helpers'
import { SlidesCanvas } from './slides-canvas'
import { useSlidesPan } from './use-slides-pan'
import { IconButton } from '../../../../components/primitives'
import { t } from '../../../i18n'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1
/** What a page is drawn at when nothing has been asked for. */
const RESET_ZOOM = 1
/** The room the stage keeps around the page, in the stage's own pixels. */
const STAGE_PADDING = 32

/** Rounds away the float noise a repeated ±0.1 leaves behind, so the label reads 110% not 110.00000000000001%. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(Number((zoom + direction * ZOOM_STEP).toFixed(1)))
}

/** The zoom a command asks for, which is the same step the corner controls take. */
export function zoomCommand(zoom: number, command: 'in' | 'out' | 'reset'): number {
  if (command === 'reset') return RESET_ZOOM
  return steppedZoom(zoom, command === 'in' ? 1 : -1)
}

/**
 * The zoom that shows the whole page: the stage's box, inset by the room the stage keeps around
 * it. It is not rounded, because rounding up would put the page back over the edge it was fitted
 * to — the label is what rounds, and it rounds only for reading.
 */
export function fitZoom(page: PageSize, stage: PageSize): number {
  const usable = {
    width: Math.max(stage.width - STAGE_PADDING * 2, 0),
    height: Math.max(stage.height - STAGE_PADDING * 2, 0),
  }
  return clampZoom(fitPageScale(page, usable))
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

interface SlidesStageProps {
  slide: Slide | undefined
  theme: SlidesTheme
  page: PageSize
  zoom: number
  /** Every selected box; the last one picked is the one the handles belong to. */
  selectedIds: string[]
  editingElementId: string | null
  assets?: Record<string, string>
  onSelectElement: (id: string | null, additive?: boolean) => void
  onSelectMany: (ids: string[]) => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onMoveElements: (positions: ElementPosition[]) => void
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
 *
 * It is also the scroll box a pan moves (use-slides-pan.ts), and what it scrolls is why the page
 * is centred with `m-auto` rather than by the flex container: a centred child that overflows is
 * clipped on its start side with no way to scroll back to it, so a zoomed page would lose the
 * corner it grew past.
 */
export const SlidesStage = memo(function SlidesStage(props: SlidesStageProps) {
  const { page, slide, zoom, onZoom, onStartSlideshow } = props
  const { stageRef, pan, isPan, fitToWindow } = useStageViewport({ page, onZoom })

  return (
    <div className='relative flex flex-1 min-w-0'>
      <main
        ref={stageRef}
        className='bento-canvas-stage flex'
        style={{
          padding: STAGE_PADDING,
          cursor: pan.isPanning ? 'grabbing' : pan.isPanReady ? 'grab' : undefined,
        }}
        onMouseDownCapture={pan.onMouseDownCapture}
        onContextMenu={(event) => props.onContextMenuAt(elementIdAt(event.target), event)}
        onDoubleClick={(event) => startTypingAt(event, props.onStartTyping)}
      >
        {slide && <StagePage {...props} frozen={isPan} />}
      </main>

      <StageControls {...{ zoom, onZoom, onStartSlideshow, onFitToWindow: fitToWindow }} />
    </div>
  )
})

/**
 * The page inside the stage: the box that reserves the room the page takes up at this zoom, with
 * the page itself scaled into it. The two have to be separate boxes because a transform is not
 * layout — the scaled page reports its unscaled size to the scroller, and a zoomed deck would
 * then never be scrollable to its own far edge.
 */
function StagePage({ slide, theme, page, zoom, frozen, ...canvas }: SlidesStageProps & { frozen: boolean }) {
  if (!slide) return null
  return (
    <div
      style={{ width: `${page.width * zoom}px`, height: `${page.height * zoom}px` }}
      className='relative shrink-0 m-auto'
    >
      <SlidesCanvas
        {...canvas}
        slide={slide}
        theme={theme}
        page={page}
        scale={zoom}
        editable={true}
        frozen={frozen}
        primaryId={canvas.selectedIds?.[canvas.selectedIds.length - 1] ?? null}
      />
    </div>
  )
}

/** A double click on a box asks to type in it; a double click on the backdrop asks for nothing. */
function startTypingAt(event: ReactMouseEvent<HTMLElement>, onStartTyping: (id: string) => void): void {
  const elementId = elementIdAt(event.target)
  if (elementId) onStartTyping(elementId)
}

/**
 * The stage's own view: the box a pan scrolls, the gesture that moves it, and what "fit" means
 * for a box that has just been measured. It is a box of its own because the stage above is a
 * layout — which page is showing, and what a press on it means — and this is the view around it.
 */
function useStageViewport({
  page,
  onZoom,
}: {
  page: PageSize
  onZoom: (zoom: number) => void
}) {
  const stageRef = useRef<HTMLElement | null>(null)
  const pan = useSlidesPan(stageRef)

  const fitToWindow = () => {
    const box = stageRef.current
    if (box) onZoom(fitZoom(page, { width: box.clientWidth, height: box.clientHeight }))
  }

  return { stageRef, pan, isPan: pan.isPanReady || pan.isPanning, fitToWindow }
}

/** The corner cluster: start the show, fit the whole page, or zoom in by a step at a time. */
function StageControls({
  zoom,
  onZoom,
  onFitToWindow,
  onStartSlideshow,
}: {
  zoom: number
  onZoom: (zoom: number) => void
  onFitToWindow: () => void
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

        <IconButton label={t('slides.fit_to_window')} size='sm' variant='ghost' onClick={onFitToWindow}>
          <span aria-hidden='true'>⤢</span>
        </IconButton>

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
