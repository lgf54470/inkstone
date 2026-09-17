import { memo } from 'react'
import { Modal } from '../../../../components/overlay'
import { SlidesCanvas } from './slides-canvas'
import { BUILTIN_LAYOUTS, instantiateLayout, type SlideLayout } from '../layouts'
import type { PageSize } from '../page'
import type { SlidesTheme } from '../types'
import { t } from '../../../i18n'

const PREVIEW_WIDTH = 168
const PICKER_WIDTH = 720

interface LayoutPickerProps {
  open: boolean
  theme: SlidesTheme
  page: PageSize
  onPick: (layoutId: string) => void
  onClose: () => void
}

/**
 * The way into a new slide: a page of the deck's own size and shape, so what the reader
 * picks is what they get. The previews are the real canvas drawing the real layout, which
 * is why a deck's page size and palette show up in them without either being a parameter
 * of this file.
 */
export const LayoutPicker = memo(function LayoutPicker({
  open,
  theme,
  page,
  onPick,
  onClose,
}: LayoutPickerProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('slides.choose_layout')}
      description={t('slides.choose_layout_hint')}
      width={PICKER_WIDTH}
    >
      <div className='grid grid-cols-3 gap-3'>
        {BUILTIN_LAYOUTS.map((layout) => (
          <LayoutCard key={layout.id} layout={layout} theme={theme} page={page} onPick={onPick} />
        ))}
      </div>
    </Modal>
  )
})

function LayoutCard({
  layout,
  theme,
  page,
  onPick,
}: {
  layout: SlideLayout
  theme: SlidesTheme
  page: PageSize
  onPick: (layoutId: string) => void
}) {
  const slide = instantiateLayout(layout, page, {
    accent: theme.accent,
    message: (key) => t(key),
    seed: 'preview',
  })
  const scale = PREVIEW_WIDTH / page.width

  return (
    <button
      type='button'
      data-layout-option={layout.id}
      onClick={() => onPick(layout.id)}
      className='group flex flex-col gap-1.5 rounded-[var(--r-lg)] border border-[var(--border-subtle)] p-1.5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]'
    >
      <span
        className='pointer-events-none relative block overflow-hidden rounded-[var(--r-sm)]'
        style={{ width: `${PREVIEW_WIDTH}px`, height: `${Math.round(page.height * scale)}px` }}
      >
        <span
          className='absolute top-0 left-0 block origin-top-left'
          style={{
            width: `${page.width}px`,
            height: `${page.height}px`,
            transform: `scale(${scale})`,
          }}
        >
          <SlidesCanvas
            slide={slide}
            theme={{ ...theme, background: slide.background || theme.background }}
            page={page}
            scale={1}
            editable={false}
          />
        </span>
      </span>
      <span className='truncate text-[length:var(--text-12)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'>
        {t(layout.nameKey)}
      </span>
    </button>
  )
}
