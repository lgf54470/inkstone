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
          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>
              {t('slides.page_size')}
            </label>
            <select
              value={selectedSizeKey}
              onChange={(e) => handlePageSizeChange(e.target.value)}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
            >
              <option value='16:9'>{t('slides.size_16_9')}</option>
              <option value='4:3'>{t('slides.size_4_3')}</option>
              <option value='a4'>{t('slides.size_a4')}</option>
              <option value='custom'>{t('slides.size_custom')}</option>
            </select>
          </div>

          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>
              {t('slides.background_color')}
            </label>
            <div className='flex items-center gap-2'>
              <input
                type='color'
                value={slide.background?.startsWith('#') ? slide.background : DEFAULT_SLIDE_BG}
                onChange={(e) => onUpdateSlide({ background: e.target.value })}
                className='size-7 rounded border border-[var(--border-subtle)] bg-transparent p-0 cursor-pointer shrink-0'
              />
              <input
                type='text'
                value={slide.background || ''}
                placeholder={t('slides.background_placeholder')}
                onChange={(e) => onUpdateSlide({ background: e.target.value })}
                className='flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)] font-mono text-[length:var(--text-11)]'
              />
            </div>
          </div>

          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>
              {t('slides.transition')}
            </label>
            <select
              value={slide.transition || 'none'}
              onChange={(e) => onUpdateSlide({ transition: e.target.value as SlideTransitionKind })}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]'
            >
              <option value='none'>{t('slides.transition_none')}</option>
              <option value='fade'>{t('slides.transition_fade')}</option>
              <option value='morph'>{t('slides.transition_morph')}</option>
              <option value='slide'>{t('slides.transition_slide')}</option>
              <option value='zoom'>{t('slides.transition_zoom')}</option>
            </select>
          </div>

          <div className='pt-1 space-y-1.5'>
            <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-primary)] cursor-pointer'>
              <input
                type='checkbox'
                checked={!!slide.hidden}
                onChange={(e) => onUpdateSlide({ hidden: e.target.checked })}
                className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
              />
              <span>{t('slides.hide_slide')}</span>
            </label>

            <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-primary)] cursor-pointer'>
              <input
                type='checkbox'
                checked={!!slide.unnumbered}
                onChange={(e) => onUpdateSlide({ unnumbered: e.target.checked })}
                className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
              />
              <span>{t('slides.unnumbered')}</span>
            </label>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={t('slides.slideshow_settings')} defaultOpen={true}>
        <div className='space-y-2 text-[length:var(--text-11)] text-[var(--text-primary)]'>
          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={presentSettings.slideNumber ?? true}
              onChange={(e) => onUpdatePresentSettings({ slideNumber: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
            />
            <span>{t('slides.slide_number')}</span>
          </label>

          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={presentSettings.progress ?? true}
              onChange={(e) => onUpdatePresentSettings({ progress: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
            />
            <span>{t('slides.progress_bar')}</span>
          </label>

          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={presentSettings.controls ?? false}
              onChange={(e) => onUpdatePresentSettings({ controls: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
            />
            <span>{t('slides.corner_arrows')}</span>
          </label>

          <label className='flex items-center gap-2 cursor-pointer'>
            <input
              type='checkbox'
              checked={presentSettings.numberHidden ?? false}
              onChange={(e) => onUpdatePresentSettings({ numberHidden: e.target.checked })}
              className='rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-0'
            />
            <span>{t('slides.number_hidden')}</span>
          </label>
        </div>
      </InspectorSection>
    </>
  )
})
