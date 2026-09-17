import { memo, type MouseEvent } from 'react'
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { IconButton } from '../../../../components/primitives'
import type { Slide, SlidesTheme } from '../types'
import { SlidesCanvas } from './slides-canvas'
import type { PageSize } from '../page'
import { t } from '../../../i18n'

const THUMB_WIDTH = 156

interface SlideThumbnailProps {
  slide: Slide
  idx: number
  isActive: boolean
  /** The deck's page, so a 4:3 deck gets 4:3 thumbnails instead of a cropped 16:9 one. */
  size: PageSize
  theme: SlidesTheme
  assets?: Record<string, string>
  canDelete: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onContextMenu?: (slideId: string, event: MouseEvent) => void
}

/** The picture of a page: clicking it selects the page, and the buttons on top act on it. */
function ThumbnailPicture({
  slide,
  size,
  theme,
  assets,
}: Pick<SlideThumbnailProps, 'slide' | 'size' | 'theme' | 'assets'>) {
  const scale = THUMB_WIDTH / size.width
  return (
    <div
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
      }}
    >
      <SlidesCanvas slide={slide} theme={theme} page={size} assets={assets} scale={1} editable={false} />
    </div>
  )
}

/** Duplicate, delete and move, reachable from the keyboard once the page is selected. */
function ThumbnailActions({
  slide,
  canDelete,
  canMoveUp,
  canMoveDown,
  onDuplicate,
  onDelete,
  onMove,
}: Pick<
  SlideThumbnailProps,
  'slide' | 'canDelete' | 'canMoveUp' | 'canMoveDown' | 'onDuplicate' | 'onDelete' | 'onMove'
>) {
  return (
    <div className='absolute top-1 right-1 z-20 flex items-center gap-0.5 rounded bg-[var(--bg-surface)]/95 p-0.5 opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'>
      <IconButton
        label={t('slides.move_slide_up')}
        size='sm'
        disabled={!canMoveUp}
        onClick={() => onMove(slide.id, 'up')}
      >
        <ChevronUp size={11} />
      </IconButton>
      <IconButton
        label={t('slides.move_slide_down')}
        size='sm'
        disabled={!canMoveDown}
        onClick={() => onMove(slide.id, 'down')}
      >
        <ChevronDown size={11} />
      </IconButton>
      <IconButton
        label={t('slides.duplicate_slide')}
        size='sm'
        onClick={() => onDuplicate(slide.id)}
      >
        <Copy size={11} />
      </IconButton>
      <IconButton
        label={t('slides.delete_slide')}
        size='sm'
        disabled={!canDelete}
        onClick={() => onDelete(slide.id)}
      >
        <Trash2 size={11} />
      </IconButton>
    </div>
  )
}

const SlideThumbnail = memo(function SlideThumbnail(props: SlideThumbnailProps) {
  const { slide, idx, isActive, size, onSelect, onContextMenu } = props
  const scale = THUMB_WIDTH / size.width
  const thumbHeight = Math.round(size.height * scale)

  return (
    <div
      data-slide-thumbnail
      onContextMenu={(event) => onContextMenu?.(slide.id, event)}
      className={`group relative shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
        isActive
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] shadow-xs'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      }`}
      style={{ width: `${THUMB_WIDTH}px`, height: `${thumbHeight}px` }}
    >
      <button
        type='button'
        data-slide-select
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${t('slides.slide_title')} ${idx + 1}${slide.title ? `: ${slide.title}` : ''}`}
        onClick={() => onSelect(slide.id)}
        className='absolute inset-0 z-10 cursor-pointer'
      />
      <span
        aria-hidden='true'
        className='absolute top-1 left-1 z-20 rounded bg-[var(--bg-surface)]/90 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--text-secondary)] shadow-xs'
      >
        {idx + 1}
      </span>
      <ThumbnailActions {...props} />
      <ThumbnailPicture slide={slide} size={size} theme={props.theme} assets={props.assets} />
    </div>
  )
})

interface SlidesSidebarProps {
  slides: Slide[]
  size: PageSize
  activeSlideId: string
  theme: SlidesTheme
  assets?: Record<string, string>
  onSelectSlide: (id: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (id: string) => void
  onDeleteSlide: (id: string) => void
  onMoveSlide: (id: string, direction: 'up' | 'down') => void
  onContextMenuSlide?: (slideId: string, event: MouseEvent) => void
}

export const SlidesSidebar = memo(function SlidesSidebar({
  slides,
  size,
  activeSlideId,
  theme,
  assets,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onContextMenuSlide,
}: SlidesSidebarProps) {
  return (
    <aside
      aria-label={t('slides.slide_list')}
      className='flex w-48 shrink-0 flex-col items-center gap-2.5 overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 select-none'
    >
      {slides.map((slide, idx) => (
        <SlideThumbnail
          key={slide.id}
          slide={slide}
          idx={idx}
          isActive={slide.id === activeSlideId}
          size={size}
          theme={theme}
          assets={assets}
          canDelete={slides.length > 1}
          canMoveUp={idx > 0}
          canMoveDown={idx < slides.length - 1}
          onSelect={onSelectSlide}
          onDuplicate={onDuplicateSlide}
          onDelete={onDeleteSlide}
          onMove={onMoveSlide}
          onContextMenu={onContextMenuSlide}
        />
      ))}

      <button
        type='button'
        onClick={onAddSlide}
        className='flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border-subtle)] py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]'
      >
        <Plus size={13} />
        <span>{t('slides.add_slide')}</span>
      </button>
    </aside>
  )
})
