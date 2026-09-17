import { memo, useEffect, useState, useMemo } from 'react'
import type { BentoDoc } from '../types'
import { SlidesCanvas } from './slides-canvas'
import { audienceSlides } from '../flow'
import { fitPageScale } from '../page'
import { t } from '../../../i18n'

/** How much air a show leaves around the page on a screen that is not the page's shape. */
const SHOW_PADDING = 40
/** A page blown up past this is a projector seen from far away, not a larger page. */
const MAX_SHOW_SCALE = 1.8

interface SlidesPresenterProps {
  doc: BentoDoc
  initialIndex?: number
  onClose: () => void
}

export const SlidesPresenter = memo(function SlidesPresenter({
  doc,
  initialIndex = 0,
  onClose,
}: SlidesPresenterProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showNotes, setShowNotes] = useState(false)
  const [scale, setScale] = useState(1)

  const slides = useMemo(() => audienceSlides(doc), [doc])
  const currentSlide = slides[currentIndex] || slides[0]
  const total = slides.length

  const goNext = () => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : prev))
  }

  const goPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : 0))
  }

  useEffect(() => {
    const handleResize = () => {
      const box = {
        width: window.innerWidth - SHOW_PADDING * 2,
        height: window.innerHeight - SHOW_PADDING * 2,
      }
      setScale(Math.min(fitPageScale(doc.size, box), MAX_SHOW_SCALE))
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [doc.size])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        setShowNotes((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [total, onClose])

  if (!currentSlide) return null

  const present = doc.present ?? {}
  const showNumber = present.slideNumber !== false && !currentSlide.unnumbered
  // "Number hidden slides" decides whether the pages the show skips are numbered at all:
  // with it on, both the count and the total follow the deck's own order instead of the
  // order of what the audience happens to see.
  const numbered = present.numberHidden ? doc.slides : slides
  const numberShown = numbered.findIndex((slide) => slide.id === currentSlide.id) + 1
  const numberTotal = numbered.length
  const progressPercent = total > 1 ? Math.round(((currentIndex + 1) / total) * 100) : 100

  return (
    <div className='fixed top-0 left-0 size-full z-50 flex flex-col items-center justify-center bg-black select-none'>
      <div className='flex flex-1 items-center justify-center w-full h-full overflow-hidden'>
        <div
          style={{
            width: `${doc.size.width * scale}px`,
            height: `${doc.size.height * scale}px`,
          }}
          className='relative flex items-center justify-center'
        >
          <SlidesCanvas
            slide={currentSlide}
            theme={doc.theme}
            page={doc.size}
            scale={scale}
            editable={false}
          />
        </div>
      </div>

      {showNotes && currentSlide.notes && (
        <div className='absolute bottom-16 right-8 max-w-md rounded-xl bg-[var(--bg-surface)] p-4 shadow-2xl border border-[var(--border-subtle)] text-sm text-[var(--text-primary)]'>
          <div className='flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]'>
            <span className='font-semibold'>{t('slides.speaker_notes')}</span>
            <button
              type='button'
              onClick={() => setShowNotes(false)}
              className='text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            >
              ✕
            </button>
          </div>
          <p className='whitespace-pre-wrap leading-relaxed'>{currentSlide.notes}</p>
        </div>
      )}

      {showNumber && (
        <span
          data-present-number
          className='absolute right-5 bottom-5 rounded px-2 py-0.5 text-sm font-medium text-white/75'
        >
          {numberShown} / {numberTotal}
        </span>
      )}

      {present.controls && (
        <div
          data-present-arrows
          className='pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4'
        >
          <button
            type='button'
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label={t('slides.previous_slide')}
            className='pointer-events-auto rounded-full bg-black/45 p-3 text-white/80 hover:text-white disabled:opacity-0'
          >
            ◀
          </button>
          <button
            type='button'
            onClick={goNext}
            disabled={currentIndex === total - 1}
            aria-label={t('slides.next_slide')}
            className='pointer-events-auto rounded-full bg-black/45 p-3 text-white/80 hover:text-white disabled:opacity-0'
          >
            ▶
          </button>
        </div>
      )}

      <div className='absolute bottom-4 flex items-center gap-4 px-6 py-2 rounded-full bg-black/70 backdrop-blur text-white shadow-xl opacity-20 hover:opacity-100 transition-opacity'>
        <button
          type='button'
          onClick={goPrev}
          disabled={currentIndex === 0}
          className='p-1 hover:text-[var(--accent)] disabled:opacity-30'
          aria-label={t('slides.previous_slide')}
        >
          ◀
        </button>
        <button
          type='button'
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className='p-1 hover:text-[var(--accent)] disabled:opacity-30'
          aria-label={t('slides.next_slide')}
        >
          ▶
        </button>
        {currentSlide.notes && (
          <button
            type='button'
            onClick={() => setShowNotes((p) => !p)}
            className={`text-xs px-2 py-0.5 rounded border ${
              showNotes ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-white/30'
            }`}
          >
            {t('slides.notes')}
          </button>
        )}
        <button
          type='button'
          onClick={onClose}
          className='text-xs px-2 py-0.5 rounded bg-white/20 hover:bg-white/30'
          title={t('common.close')}
        >
          {'ESC'}
        </button>
      </div>

      {present.progress !== false && (
        <div
          data-present-progress
          className='absolute bottom-0 left-0 h-1 bg-[var(--accent)] transition-all'
          style={{ width: `${progressPercent}%` }}
        />
      )}
    </div>
  )
})
