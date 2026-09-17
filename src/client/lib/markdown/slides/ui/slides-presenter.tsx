import { memo, useEffect, useState, useMemo } from 'react'
import type { BentoDoc } from '../types'
import { SlidesCanvas } from './slides-canvas'
import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from './canvas-helpers'
import { t } from '../../../i18n'

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

  const slides = useMemo(() => doc.slides.filter((s) => !s.hidden), [doc.slides])
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
      const pad = 40
      const availW = window.innerWidth - pad * 2
      const availH = window.innerHeight - pad * 2
      const scaleW = availW / VIRTUAL_CANVAS_WIDTH
      const scaleH = availH / VIRTUAL_CANVAS_HEIGHT
      setScale(Math.min(scaleW, scaleH, 1.8))
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  const progressPercent = total > 1 ? Math.round(((currentIndex + 1) / total) * 100) : 100

  return (
    <div className='fixed top-0 left-0 size-full z-50 flex flex-col items-center justify-center bg-black select-none'>
      <div className='flex flex-1 items-center justify-center w-full h-full overflow-hidden'>
        <div
          style={{
            width: `${VIRTUAL_CANVAS_WIDTH * scale}px`,
            height: `${VIRTUAL_CANVAS_HEIGHT * scale}px`,
          }}
          className='relative flex items-center justify-center'
        >
          <SlidesCanvas
            slide={currentSlide}
            theme={doc.theme}
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

      <div className='absolute bottom-4 flex items-center gap-4 px-6 py-2 rounded-full bg-black/70 backdrop-blur text-white shadow-xl opacity-20 hover:opacity-100 transition-opacity'>
        <button
          type='button'
          onClick={goPrev}
          disabled={currentIndex === 0}
          className='p-1 hover:text-[var(--accent)] disabled:opacity-30'
          title={t('slides.previous_slide')}
        >
          ◀
        </button>
        <span className='text-sm font-medium'>
          {currentIndex + 1} / {total}
        </span>
        <button
          type='button'
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className='p-1 hover:text-[var(--accent)] disabled:opacity-30'
          title={t('slides.next_slide')}
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

      <div className='absolute bottom-0 left-0 h-1 bg-[var(--accent)] transition-all' style={{ width: `${progressPercent}%` }} />
    </div>
  )
})
