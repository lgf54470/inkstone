import { memo, type RefObject } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Play } from 'lucide-react'
import { t } from '../../../i18n'
import { Button, IconButton } from '../../../../components/primitives'
import type { BentoDoc, Slide } from '../types'
import { SlidesCanvas } from './slides-canvas'
import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from './canvas-helpers'

const BENTO_BADGE_TEXT = 'Bento'

interface InlineIdentityProps {
  title: string
  slideIndex: number
  slideCount: number
}

/** Which deck this is, and where the reader is in it. */
function InlineIdentity({ title, slideIndex, slideCount }: InlineIdentityProps) {
  return (
    <div className='flex items-center gap-2 font-medium'>
      <span className='rounded bg-[var(--accent)] px-1.5 py-0.5 text-[length:var(--text-10)] font-bold text-white'>
        {BENTO_BADGE_TEXT}
      </span>
      <span className='max-w-44 truncate'>{title}</span>
      <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
        {slideIndex + 1} / {slideCount}
      </span>
    </div>
  )
}

interface InlineActionsProps {
  slideIndex: number
  slideCount: number
  onSelectSlide: (index: number) => void
  onPlay: () => void
  onToggleFullscreen?: () => void
}

/** The three things this surface can do with a deck: step, play in place, or open the editor. */
function InlineActions({
  slideIndex,
  slideCount,
  onSelectSlide,
  onPlay,
  onToggleFullscreen,
}: InlineActionsProps) {
  return (
    <div className='flex items-center gap-1'>
      <IconButton
        label={t('slides.previous_slide')}
        size='sm'
        disabled={slideIndex === 0}
        onClick={() => onSelectSlide(slideIndex - 1)}
      >
        <ChevronLeft size={14} />
      </IconButton>
      <IconButton
        label={t('slides.next_slide')}
        size='sm'
        disabled={slideIndex === slideCount - 1}
        onClick={() => onSelectSlide(slideIndex + 1)}
      >
        <ChevronRight size={14} />
      </IconButton>
      <span className='mx-1 h-3 w-px bg-[var(--border-subtle)]' />
      <Button size='sm' variant='ghost' onClick={onPlay}>
        <Play size={13} />
        {t('slides.play')}
      </Button>
      <IconButton
        label={t('preview.slides_fullscreen')}
        size='sm'
        onClick={() => onToggleFullscreen?.()}
      >
        <Maximize2 size={14} />
      </IconButton>
    </div>
  )
}

function InlineHeader(props: InlineIdentityProps & InlineActionsProps) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs'>
      <InlineIdentity {...props} />
      <InlineActions {...props} />
    </div>
  )
}

interface InlineStageProps {
  data: BentoDoc
  slide: Slide
  scale: number
  stageRef: RefObject<HTMLDivElement | null>
}

function InlineStage({ data, slide, scale, stageRef }: InlineStageProps) {
  return (
    <div
      ref={stageRef}
      className='relative flex w-full items-center justify-center overflow-hidden bg-black/10'
      style={{ height: `${VIRTUAL_CANVAS_HEIGHT * scale}px` }}
    >
      <div
        style={{
          width: `${VIRTUAL_CANVAS_WIDTH * scale}px`,
          height: `${VIRTUAL_CANVAS_HEIGHT * scale}px`,
        }}
        className='relative'
      >
        <SlidesCanvas
          slide={slide}
          theme={data.theme}
          assets={data.assets}
          scale={scale}
          editable={false}
        />
      </div>
    </div>
  )
}

interface SlidesInlinePreviewProps extends InlineActionsProps {
  data: BentoDoc
  slide: Slide
  scale: number
  stageRef: RefObject<HTMLDivElement | null>
}

/** The card a note shows for the block: one slide, page stepping, and the way into the editor. */
export const SlidesInlinePreview = memo(function SlidesInlinePreview({
  data,
  slide,
  slideIndex,
  slideCount,
  scale,
  stageRef,
  onSelectSlide,
  onPlay,
  onToggleFullscreen,
}: SlidesInlinePreviewProps) {
  return (
    <div className='flex w-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] shadow-xs'>
      <InlineHeader
        title={data.title}
        slideIndex={slideIndex}
        slideCount={slideCount}
        onSelectSlide={onSelectSlide}
        onPlay={onPlay}
        onToggleFullscreen={onToggleFullscreen}
      />
      <InlineStage data={data} slide={slide} scale={scale} stageRef={stageRef} />
    </div>
  )
})
