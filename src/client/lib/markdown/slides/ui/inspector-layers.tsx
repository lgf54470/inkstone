import { memo } from 'react'
import {
  Type,
  Code2,
  Square,
  Image as ImageIcon,
  Table as TableIcon,
  BarChart3,
  Layers,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { Slide, SlideElement } from '../types'
import { InspectorSection } from './inspector-section'
import { t } from '../../../i18n'

interface InspectorLayersProps {
  slide: Slide
  selectedElementId: string | null
  onSelectElement: (id: string) => void
  onReorderElement: (id: string, direction: 'up' | 'down') => void
}

function getElementExcerpt(el: SlideElement): string {
  switch (el.type) {
    case 'text': {
      const clean = el.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      return clean || t('slides.layer_text')
    }
    case 'shape':
      return el.shape === 'rect'
        ? t('slides.shape_rect')
        : el.shape === 'circle'
          ? t('slides.shape_circle')
          : el.shape === 'card'
            ? t('slides.shape_bento_box')
            : t('slides.layer_shape')
    case 'image':
      return t('slides.layer_image')
    case 'table':
      return t('slides.layer_table')
    case 'chart':
      return el.title || t('slides.layer_chart')
    case 'code':
      return t('slides.layer_code')
    default:
      return t('slides.layer_embed')
  }
}

function getElementIcon(el: SlideElement) {
  switch (el.type) {
    case 'text':
      return <Type size={11} className='text-[var(--text-tertiary)] shrink-0' />
    case 'shape':
      return <Square size={11} className='text-[var(--text-tertiary)] shrink-0' />
    case 'image':
      return <ImageIcon size={11} className='text-[var(--text-tertiary)] shrink-0' />
    case 'table':
      return <TableIcon size={11} className='text-[var(--text-tertiary)] shrink-0' />
    case 'chart':
      return <BarChart3 size={11} className='text-[var(--text-tertiary)] shrink-0' />
    case 'code':
      return <Code2 size={11} className='text-[var(--text-tertiary)] shrink-0' />
    default:
      return <Layers size={11} className='text-[var(--text-tertiary)] shrink-0' />
  }
}

export const InspectorLayers = memo(function InspectorLayers({
  slide,
  selectedElementId,
  onSelectElement,
  onReorderElement,
}: InspectorLayersProps) {
  const reversedElements = [...slide.elements].reverse()

  return (
    <InspectorSection title={t('slides.layers')} defaultOpen={true}>
      {reversedElements.length === 0 ? (
        <p className='text-xs text-[var(--text-tertiary)] py-1'>{t('slides.layers_empty')}</p>
      ) : (
        <div className='space-y-0.5 max-h-72 overflow-y-auto pr-0.5'>
          {reversedElements.map((el, revIdx) => {
            const isSelected = el.id === selectedElementId
            const origIdx = slide.elements.length - 1 - revIdx

            return (
              <div
                key={el.id}
                onClick={() => onSelectElement(el.id)}
                className={`group flex items-center justify-between rounded px-2 py-1 text-xs cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-[var(--accent)]/15 font-semibold text-[var(--accent)]'
                    : 'hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                }`}
              >
                <div className='flex items-center gap-2 min-w-0 flex-1 mr-1'>
                  {getElementIcon(el)}
                  <span className='truncate text-[length:var(--text-11)]'>
                    {getElementExcerpt(el)}
                  </span>
                </div>

                <div className='hidden group-hover:flex items-center gap-0.5'>
                  <button
                    type='button'
                    aria-label={t('slides.bring_forward')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorderElement(el.id, 'up')
                    }}
                    disabled={origIdx === slide.elements.length - 1}
                    className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] disabled:opacity-20'
                  >
                    <ChevronUp size={10} />
                  </button>
                  <button
                    type='button'
                    aria-label={t('slides.send_backward')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorderElement(el.id, 'down')
                    }}
                    disabled={origIdx === 0}
                    className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] disabled:opacity-20'
                  >
                    <ChevronDown size={10} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </InspectorSection>
  )
})
