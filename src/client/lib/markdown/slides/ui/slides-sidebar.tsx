import { memo } from 'react'
import { Plus, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react'
import type { Slide, SlidesTheme } from '../types'
import { SlidesCanvas } from './slides-canvas'
import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from './canvas-helpers'
import { t } from '../../../i18n'

const THUMB_WIDTH = 156
const THUMB_SCALE = THUMB_WIDTH / VIRTUAL_CANVAS_WIDTH
const THUMB_HEIGHT = Math.round(VIRTUAL_CANVAS_HEIGHT * THUMB_SCALE)

interface SlidesSidebarProps {
  slides: Slide[]
  activeSlideId: string
  theme: SlidesTheme
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
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
}: SlidesSidebarProps) {
  return (
    <aside className='flex w-48 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-raised)] select-none shrink-0'>
      <div className='flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2'>
        <span className='text-xs font-semibold text-[var(--text-secondary)]'>
          {t('slides.slide_list')} ({slides.length})
        </span>
        <button
          type='button'
          onClick={onAddSlide}
          title={t('slides.add_slide')}
          className='flex size-6 items-center justify-center rounded-md bg-[var(--accent)] text-white text-xs font-bold shadow-xs hover:brightness-110'
        >
          <Plus size={13} />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-2 space-y-2.5'>
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId

          return (
            <div
              key={slide.id}
              onClick={() => onSelectSlide(slide.id)}
              className={`group relative flex flex-col rounded-lg border p-1.5 transition-all cursor-pointer ${
                isActive
                  ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--bg-hover)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)]'
              }`}
            >
              <div className='flex items-center justify-between mb-1 px-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
                <span className='font-bold'>{idx + 1}</span>
                <span className='truncate max-w-20 font-medium'>
                  {slide.title || `Slide ${idx + 1}`}
                </span>
                <div className='hidden group-hover:flex items-center gap-0.5'>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveSlide(slide.id, 'up')
                    }}
                    disabled={idx === 0}
                    className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-inset)] disabled:opacity-20'
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveSlide(slide.id, 'down')
                    }}
                    disabled={idx === slides.length - 1}
                    className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-inset)] disabled:opacity-20'
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>
              </div>

              <div
                style={{
                  width: `${THUMB_WIDTH}px`,
                  height: `${THUMB_HEIGHT}px`,
                }}
                className='relative rounded-xs border border-[var(--border-subtle)]/60 overflow-hidden shrink-0 pointer-events-none'
              >
                <div
                  style={{
                    width: `${VIRTUAL_CANVAS_WIDTH}px`,
                    height: `${VIRTUAL_CANVAS_HEIGHT}px`,
                    transform: `scale(${THUMB_SCALE})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <SlidesCanvas
                    slide={slide}
                    theme={theme}
                    scale={1}
                    editable={false}
                  />
                </div>
              </div>

              <div className='hidden group-hover:flex items-center justify-end gap-1 mt-1 pt-1 border-t border-[var(--border-subtle)] text-[length:var(--text-10)]'>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicateSlide(slide.id)
                  }}
                  title={t('slides.duplicate_slide')}
                  className='p-1 rounded hover:bg-[var(--bg-inset)] text-[var(--text-secondary)]'
                >
                  <Copy size={11} />
                </button>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSlide(slide.id)
                  }}
                  disabled={slides.length <= 1}
                  title={t('slides.delete_slide')}
                  className='p-1 rounded hover:bg-[var(--bg-inset)] text-[var(--danger)] disabled:opacity-30'
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}

        <button
          type='button'
          onClick={onAddSlide}
          className='flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-default)] py-2 text-xs font-medium text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors'
        >
          <Plus size={13} />
          <span>{t('slides.add_slide')}</span>
        </button>
      </div>
    </aside>
  )
})
