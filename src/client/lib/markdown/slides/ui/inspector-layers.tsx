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

/**
 * The two reorder controls a layer row holds. They are revealed the way the rest of the app reveals a
 * row's own controls — `opacity-0` and not `display: none`: a hidden subtree is out of reach for the
 * keyboard and for a screen reader, so the two buttons could not be focused or announced at all while
 * this row was the one place in the client that hid them this way. The focus half is what makes them
 * usable once they are: tabbing to one shows it.
 */
function LayerOrderButtons({
  elementId,
  canMoveUp,
  canMoveDown,
  onReorder,
}: {
  elementId: string
  canMoveUp: boolean
  canMoveDown: boolean
  onReorder: (id: string, direction: 'up' | 'down') => void
}) {
  return (
    <div className='flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
      <button
        type='button'
        aria-label={t('slides.bring_forward')}
        onClick={(e) => {
          e.stopPropagation()
          onReorder(elementId, 'up')
        }}
        disabled={!canMoveUp}
        className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] disabled:opacity-20'
      >
        <ChevronUp size={10} />
      </button>
      <button
        type='button'
        aria-label={t('slides.send_backward')}
        onClick={(e) => {
          e.stopPropagation()
          onReorder(elementId, 'down')
        }}
        disabled={!canMoveDown}
        className='size-4 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] disabled:opacity-20'
      >
        <ChevronDown size={10} />
      </button>
    </div>
  )
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

                <LayerOrderButtons
                  elementId={el.id}
                  canMoveUp={origIdx !== slide.elements.length - 1}
                  canMoveDown={origIdx !== 0}
                  onReorder={onReorderElement}
                />
              </div>
            )
          })}
        </div>
      )}
    </InspectorSection>
  )
})
