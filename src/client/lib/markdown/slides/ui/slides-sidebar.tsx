import { memo } from 'react'
import type { Slide, SlidesTheme } from '../types'
import { t } from '../../../i18n'

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
          className='flex size-6 items-center justify-center rounded-md bg-[var(--accent)] text-white text-sm font-bold shadow-xs hover:brightness-110'
        >
          +
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-2 space-y-2'>
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId
          const bg = slide.background || theme.background || 'var(--bg-inset)'

          return (
            <div
              key={slide.id}
              onClick={() => onSelectSlide(slide.id)}
              className={`group relative flex flex-col rounded-lg border p-1.5 transition-all cursor-pointer ${
                isActive
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30 bg-[var(--bg-hover)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)]'
              }`}
            >
              <div className='flex items-center justify-between mb-1 px-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
                <span className='font-bold'>{idx + 1}</span>
                <span className='truncate max-w-20 font-medium'>
                  {slide.title || `Slide ${idx + 1}`}
                </span>
                <div className='hidden group-hover:flex items-center gap-1'>
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveSlide(slide.id, 'up')
                    }}
                    disabled={idx === 0}
                    className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-inset)] disabled:opacity-20'
                  >
                    ▲
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
                    ▼
                  </button>
                </div>
              </div>

              <div
                style={{ backgroundColor: bg }}
                className='relative aspect-video w-full rounded border border-[var(--border-subtle)]/40 overflow-hidden flex items-center justify-center p-1'
              >
                <span
                  style={{ color: theme.color || 'var(--text-primary)' }}
                  className='text-[length:var(--text-9)] font-semibold text-center truncate w-full opacity-80'
                >
                  {slide.title || `Slide ${idx + 1}`}
                </span>
              </div>

              <div className='hidden group-hover:flex items-center justify-end gap-1 mt-1 pt-1 border-t border-[var(--border-subtle)] text-[length:var(--text-10)]'>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicateSlide(slide.id)
                  }}
                  className='px-1 py-0.5 rounded hover:bg-[var(--bg-inset)] text-[var(--text-secondary)]'
                  title={t('slides.duplicate_slide')}
                >
                  {t('common.copy')}
                </button>
                {slides.length > 1 && (
                  <button
                    type='button'
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSlide(slide.id)
                    }}
                    className='px-1 py-0.5 rounded hover:bg-[var(--bg-inset)] text-[var(--danger)]'
                    title={t('slides.delete_slide')}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
})
