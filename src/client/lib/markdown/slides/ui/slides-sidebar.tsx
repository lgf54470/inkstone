import { memo } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import type { Slide, SlidesTheme } from '../types'
import { SlidesCanvas } from './slides-canvas'
import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from './canvas-helpers'
import { t } from '../../../i18n'

const THUMB_WIDTH = 156
const THUMB_SCALE = THUMB_WIDTH / VIRTUAL_CANVAS_WIDTH
const THUMB_HEIGHT = Math.round(VIRTUAL_CANVAS_HEIGHT * THUMB_SCALE)

interface SlideThumbnailProps {
  slide: Slide
  idx: number
  isActive: boolean
  theme: SlidesTheme
  assets?: Record<string, string>
  canDelete: boolean
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

const SlideThumbnail = memo(function SlideThumbnail({
  slide,
  idx,
  isActive,
  theme,
  assets,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: SlideThumbnailProps) {
  return (
    <div
      onClick={() => onSelect(slide.id)}
      className={`group relative rounded-lg border-2 transition-all cursor-pointer overflow-hidden select-none shrink-0 ${
        isActive
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] shadow-xs'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      }`}
      style={{
        width: `${THUMB_WIDTH}px`,
        height: `${THUMB_HEIGHT}px`,
      }}
    >
      <span className='absolute top-1 left-1 z-20 text-[length:var(--text-10)] font-semibold text-[var(--text-secondary)] bg-white/90 dark:bg-black/80 rounded px-1.5 py-0.5 shadow-xs'>
        {idx + 1}
      </span>

      <div className='absolute top-1 right-1 z-20 hidden group-hover:flex items-center gap-0.5 bg-white/95 dark:bg-black/90 rounded p-0.5 shadow-xs'>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate(slide.id)
          }}
          title={t('slides.duplicate_slide')}
          className='p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        >
          <Copy size={11} />
        </button>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onDelete(slide.id)
          }}
          disabled={!canDelete}
          title={t('slides.delete_slide')}
          className='p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--danger)] disabled:opacity-30'
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div
        style={{
          width: `${VIRTUAL_CANVAS_WIDTH}px`,
          height: `${VIRTUAL_CANVAS_HEIGHT}px`,
          transform: `scale(${THUMB_SCALE})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        <SlidesCanvas
          slide={slide}
          theme={theme}
          assets={assets}
          scale={1}
          editable={false}
        />
      </div>
    </div>
  )
})

interface SlidesSidebarProps {
  slides: Slide[]
  activeSlideId: string
  theme: SlidesTheme
  assets?: Record<string, string>
  onSelectSlide: (id: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (id: string) => void
  onDeleteSlide: (id: string) => void
  onMoveSlide: (id: string, direction: 'up' | 'down') => void
}

export const SlidesSidebar = memo(function SlidesSidebar({
  slides,
  activeSlideId,
  theme,
  assets,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
}: SlidesSidebarProps) {
  return (
    <aside className='flex w-48 flex-col items-center border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] select-none shrink-0 overflow-y-auto p-3 gap-2.5'>
      {slides.map((slide, idx) => (
        <SlideThumbnail
          key={slide.id}
          slide={slide}
          idx={idx}
          isActive={slide.id === activeSlideId}
          theme={theme}
          assets={assets}
          canDelete={slides.length > 1}
          onSelect={onSelectSlide}
          onDuplicate={onDuplicateSlide}
          onDelete={onDeleteSlide}
        />
      ))}

      <button
        type='button'
        onClick={onAddSlide}
        className='flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors'
      >
        <Plus size={13} />
        <span>{t('slides.add_slide')}</span>
      </button>
    </aside>
  )
})
