import { memo } from 'react'
import type { Slide, SlideTransitionKind, SlidesPresentSettings } from '../types'
import { InspectorSection } from './inspector-section'
import { t } from '../../../i18n'

const DEFAULT_SLIDE_BG = '#0D1B2E'

interface InspectorSlideProps {
  slide: Slide
  docSize: { width: number; height: number }
  presentSettings?: SlidesPresentSettings
  onUpdateSlide: (patch: Partial<Slide>) => void
  onUpdateDocSize: (size: { width: number; height: number }) => void
  onUpdatePresentSettings: (patch: Partial<SlidesPresentSettings>) => void
}

export const InspectorSlide = memo(function InspectorSlide({
  slide,
  docSize,
  presentSettings = {},
  onUpdateSlide,
  onUpdateDocSize,
  onUpdatePresentSettings,
}: InspectorSlideProps) {
  const is169 = docSize.width === 1280 && docSize.height === 720
  const is43 = docSize.width === 1024 && docSize.height === 768
  const isA4 = docSize.width === 1123 && docSize.height === 794

  const handlePageSizeChange = (val: string) => {
    switch (val) {
      case '16:9':
        onUpdateDocSize({ width: 1280, height: 720 })
        break
      case '4:3':
        onUpdateDocSize({ width: 1024, height: 768 })
        break
      case 'a4':
        onUpdateDocSize({ width: 1123, height: 794 })
        break
      default:
        break
    }
  }

  const selectedSizeKey = is169 ? '16:9' : is43 ? '4:3' : isA4 ? 'a4' : 'custom'

  return (
    <>
      <InspectorSection title={t('slides.tab_slide')} defaultOpen={true}>
        <div className='space-y-2.5'>
          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-[var(--text-secondary)]'>{t('slides.page_size')}</span>
            <select
              value={selectedSizeKey}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              className='w-28 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
            >
              <option value='16:9'>{t('slides.size_16_9')}</option>
              <option value='4:3'>{t('slides.size_4_3')}</option>
              <option value='a4'>{t('slides.size_a4')}</option>
              <option value='custom'>{t('slides.size_custom')}</option>
            </select>
          </div>

          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-[var(--text-secondary)]'>{t('slides.background_color')}</span>
            <input
              type='color'
              value={slide.background?.startsWith('#') ? slide.background : DEFAULT_SLIDE_BG}
              onChange={(e) => onUpdateSlide({ background: e.target.value })}
              className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
            />
          </div>

          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-[var(--text-secondary)]'>{t('slides.transition')}</span>
            <select
              value={slide.transition || 'none'}
              onChange={(e) => onUpdateSlide({ transition: e.target.value as SlideTransitionKind })}
              className='w-28 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
            >
              <option value='none'>{t('slides.transition_none')}</option>
              <option value='fade'>{t('slides.transition_fade')}</option>
              <option value='morph'>{t('slides.transition_morph')}</option>
              <option value='slide'>{t('slides.transition_slide')}</option>
              <option value='zoom'>{t('slides.transition_zoom')}</option>
            </select>
          </div>

          {slide.transition === 'morph' && (
            <p data-slide-morph-pending className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
              {t('slides.transition_morph_pending')}
            </p>
          )}

          <div className='flex items-center justify-between text-xs'>
            <span className='text-[var(--text-secondary)]'>{t('slides.hide_slide')}</span>
            <input
              type='checkbox'
              checked={!!slide.hidden}
              onChange={(e) => onUpdateSlide({ hidden: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>

          <div className='flex items-center justify-between text-xs'>
            <span className='text-[var(--text-secondary)]'>{t('slides.unnumbered')}</span>
            <input
              type='checkbox'
              checked={!!slide.unnumbered}
              onChange={(e) => onUpdateSlide({ unnumbered: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={t('slides.slideshow_settings')} defaultOpen={true}>
        <div className='space-y-2 text-xs'>
          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.slide_number')}</span>
            <input
              type='checkbox'
              checked={presentSettings.slideNumber ?? true}
              onChange={(e) => onUpdatePresentSettings({ slideNumber: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.progress_bar')}</span>
            <input
              type='checkbox'
              checked={presentSettings.progress ?? true}
              onChange={(e) => onUpdatePresentSettings({ progress: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.corner_arrows')}</span>
            <input
              type='checkbox'
              checked={presentSettings.controls ?? false}
              onChange={(e) => onUpdatePresentSettings({ controls: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.number_hidden')}</span>
            <input
              type='checkbox'
              checked={presentSettings.numberHidden ?? false}
              onChange={(e) => onUpdatePresentSettings({ numberHidden: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0 size-4'
            />
          </div>
        </div>
      </InspectorSection>
    </>
  )
})
