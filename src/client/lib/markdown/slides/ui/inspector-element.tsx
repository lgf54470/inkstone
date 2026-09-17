import { memo } from 'react'
import {
  Trash2,
  ChevronUp,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react'
import type { SlideElement, TextElement, ShapeElement } from '../types'
import { InspectorSection } from './inspector-section'
import { t } from '../../../i18n'

const DEFAULT_TEXT_COLOR = '#FFFFFF'
const DEFAULT_SHAPE_FILL = '#3B82F6'
const DEFAULT_STROKE_COLOR = '#FFFFFF'

interface InspectorElementProps {
  element: SlideElement
  onUpdate: (patch: Partial<SlideElement>) => void
  onDelete: () => void
  onReorder: (direction: 'up' | 'down') => void
}

export const InspectorElement = memo(function InspectorElement({
  element,
  onUpdate,
  onDelete,
  onReorder,
}: InspectorElementProps) {
  const isText = element.type === 'text'
  const isShape = element.type === 'shape'
  const textEl = isText ? (element as TextElement) : null
  const shapeEl = isShape ? (element as ShapeElement) : null

  return (
    <>
      <InspectorSection title={t('slides.position_and_size')} defaultOpen={true}>
        <div className='grid grid-cols-2 gap-2 text-xs'>
          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.pos_x')}</label>
            <input
              type='number'
              value={element.x}
              onChange={(e) => onUpdate({ x: Number(e.target.value) })}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
            />
          </div>
          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.pos_y')}</label>
            <input
              type='number'
              value={element.y}
              onChange={(e) => onUpdate({ y: Number(e.target.value) })}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
            />
          </div>
          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.width')}</label>
            <input
              type='number'
              value={element.w}
              onChange={(e) => onUpdate({ w: Math.max(10, Number(e.target.value)) })}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
            />
          </div>
          <div>
            <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.height')}</label>
            <input
              type='number'
              value={element.h}
              onChange={(e) => onUpdate({ h: Math.max(10, Number(e.target.value)) })}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
            />
          </div>
        </div>
      </InspectorSection>

      {isText && textEl && (
        <InspectorSection title={t('slides.typography')} defaultOpen={true}>
          <div className='space-y-2.5 text-xs'>
            <div>
              <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.font_size')}</label>
              <input
                type='number'
                value={textEl.fontSize}
                onChange={(e) => onUpdate({ fontSize: Math.max(8, Number(e.target.value)) })}
                className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
              />
            </div>

            <div>
              <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.text_align')}</label>
              <div className='flex rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5'>
                <button
                  type='button'
                  onClick={() => onUpdate({ align: 'left' })}
                  className={`flex-1 flex justify-center py-1 rounded ${textEl.align === 'left' || !textEl.align ? 'bg-[var(--bg-hover)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
                >
                  <AlignLeft size={13} />
                </button>
                <button
                  type='button'
                  onClick={() => onUpdate({ align: 'center' })}
                  className={`flex-1 flex justify-center py-1 rounded ${textEl.align === 'center' ? 'bg-[var(--bg-hover)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
                >
                  <AlignCenter size={13} />
                </button>
                <button
                  type='button'
                  onClick={() => onUpdate({ align: 'right' })}
                  className={`flex-1 flex justify-center py-1 rounded ${textEl.align === 'right' ? 'bg-[var(--bg-hover)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
                >
                  <AlignRight size={13} />
                </button>
              </div>
            </div>

            <div>
              <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.theme_color')}</label>
              <div className='flex items-center gap-2'>
                <input
                  type='color'
                  value={textEl.color?.startsWith('#') ? textEl.color : DEFAULT_TEXT_COLOR}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className='size-7 rounded border border-[var(--border-subtle)] bg-transparent p-0 cursor-pointer shrink-0'
                />
                <input
                  type='text'
                  value={textEl.color || ''}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className='flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)] font-mono text-[length:var(--text-11)]'
                />
              </div>
            </div>
          </div>
        </InspectorSection>
      )}

      {isShape && shapeEl && (
        <InspectorSection title={t('slides.fill_and_stroke')} defaultOpen={true}>
          <div className='space-y-2.5 text-xs'>
            <div>
              <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.fill_color')}</label>
              <div className='flex items-center gap-2'>
                <input
                  type='color'
                  value={shapeEl.fill?.startsWith('#') ? shapeEl.fill : DEFAULT_SHAPE_FILL}
                  onChange={(e) => onUpdate({ fill: e.target.value })}
                  className='size-7 rounded border border-[var(--border-subtle)] bg-transparent p-0 cursor-pointer shrink-0'
                />
                <input
                  type='text'
                  value={shapeEl.fill || ''}
                  onChange={(e) => onUpdate({ fill: e.target.value })}
                  className='flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)] font-mono text-[length:var(--text-11)]'
                />
              </div>
            </div>

            <div>
              <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.stroke_color')}</label>
              <div className='flex items-center gap-2'>
                <input
                  type='color'
                  value={shapeEl.stroke?.startsWith('#') ? shapeEl.stroke : DEFAULT_STROKE_COLOR}
                  onChange={(e) => onUpdate({ stroke: e.target.value })}
                  className='size-7 rounded border border-[var(--border-subtle)] bg-transparent p-0 cursor-pointer shrink-0'
                />
                <input
                  type='text'
                  value={shapeEl.stroke || ''}
                  onChange={(e) => onUpdate({ stroke: e.target.value })}
                  className='flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)] font-mono text-[length:var(--text-11)]'
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-2'>
              <div>
                <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.stroke_width')}</label>
                <input
                  type='number'
                  value={shapeEl.strokeWidth ?? 0}
                  onChange={(e) => onUpdate({ strokeWidth: Math.max(0, Number(e.target.value)) })}
                  className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
                />
              </div>
              <div>
                <label className='block font-medium mb-1 text-[var(--text-secondary)] text-[length:var(--text-11)]'>{t('slides.corner_radius')}</label>
                <input
                  type='number'
                  value={shapeEl.radius ?? 0}
                  onChange={(e) => onUpdate({ radius: Math.max(0, Number(e.target.value)) })}
                  className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 outline-none focus:border-[var(--accent)]'
                />
              </div>
            </div>
          </div>
        </InspectorSection>
      )}

      <InspectorSection title={t('slides.arrange')} defaultOpen={true}>
        <div className='space-y-2 text-xs'>
          <div className='flex items-center gap-1.5'>
            <button
              type='button'
              onClick={() => onReorder('up')}
              className='flex-1 flex items-center justify-center gap-1 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
            >
              <ChevronUp size={13} />
              <span>{t('slides.bring_forward')}</span>
            </button>
            <button
              type='button'
              onClick={() => onReorder('down')}
              className='flex-1 flex items-center justify-center gap-1 py-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
            >
              <ChevronDown size={13} />
              <span>{t('slides.send_backward')}</span>
            </button>
          </div>

          <button
            type='button'
            onClick={onDelete}
            className='flex w-full items-center justify-center gap-1.5 py-1.5 rounded border border-red-500/20 bg-red-500/10 text-[var(--danger)] hover:bg-red-500/20 transition-colors'
          >
            <Trash2 size={13} />
            <span>{t('common.delete')}</span>
          </button>
        </div>
      </InspectorSection>
    </>
  )
})
