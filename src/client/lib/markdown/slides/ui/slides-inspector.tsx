import { memo, useState } from 'react'
import type { Slide, SlideElement, SlidesTheme, SlideTransitionKind, TextElement, ShapeElement } from '../types'
import { SLIDE_THEME_PRESETS } from '../colors'
import { t } from '../../../i18n'

interface SlidesInspectorProps {
  slide: Slide
  selectedElement: SlideElement | null
  theme: SlidesTheme
  onUpdateSlide: (patch: Partial<Slide>) => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onDeleteElement: (id: string) => void
  onUpdateTheme: (patch: Partial<SlidesTheme>) => void
}

export const SlidesInspector = memo(function SlidesInspector({
  slide,
  selectedElement,
  theme,
  onUpdateSlide,
  onUpdateElement,
  onDeleteElement,
  onUpdateTheme,
}: SlidesInspectorProps) {
  const [tab, setTab] = useState<'slide' | 'element' | 'theme'>(
    selectedElement ? 'element' : 'slide',
  )

  const activeTab = selectedElement && tab === 'element' ? 'element' : tab

  return (
    <aside className='flex w-64 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-raised)] select-none shrink-0 text-xs text-[var(--text-primary)]'>
      <div className='flex border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <button
          type='button'
          onClick={() => setTab('slide')}
          className={`flex-1 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'slide'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('slides.tab_slide')}
        </button>
        <button
          type='button'
          onClick={() => setTab('element')}
          disabled={!selectedElement}
          className={`flex-1 py-2 font-medium border-b-2 transition-colors disabled:opacity-30 ${
            activeTab === 'element'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('slides.tab_element')}
        </button>
        <button
          type='button'
          onClick={() => setTab('theme')}
          className={`flex-1 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'theme'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('slides.tab_theme')}
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-3 space-y-4'>
        {activeTab === 'slide' && (
          <SlideSettingsPanel slide={slide} onUpdate={onUpdateSlide} />
        )}
        {activeTab === 'element' && selectedElement && (
          <ElementSettingsPanel
            element={selectedElement}
            onUpdate={(patch) => onUpdateElement(selectedElement.id, patch)}
            onDelete={() => onDeleteElement(selectedElement.id)}
          />
        )}
        {activeTab === 'theme' && (
          <ThemeSettingsPanel theme={theme} onUpdate={onUpdateTheme} />
        )}
      </div>
    </aside>
  )
})

function SlideSettingsPanel({
  slide,
  onUpdate,
}: {
  slide: Slide
  onUpdate: (patch: Partial<Slide>) => void
}) {
  return (
    <div className='space-y-4'>
      <div>
        <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
          {t('slides.slide_title')}
        </label>
        <input
          type='text'
          value={slide.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 outline-none focus:border-[var(--accent)]'
        />
      </div>

      <div>
        <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
          {t('slides.background_color')}
        </label>
        <input
          type='text'
          value={slide.background || ''}
          placeholder={t('slides.background_placeholder')}
          onChange={(e) => onUpdate({ background: e.target.value })}
          className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 outline-none focus:border-[var(--accent)] font-mono text-[length:var(--text-11)]'
        />
      </div>

      <div>
        <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
          {t('slides.transition')}
        </label>
        <select
          value={slide.transition || 'none'}
          onChange={(e) => onUpdate({ transition: e.target.value as SlideTransitionKind })}
          className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 outline-none focus:border-[var(--accent)]'
        >
          <option value='none'>{t('slides.transition_none')}</option>
          <option value='fade'>{t('slides.transition_fade')}</option>
          <option value='slide'>{t('slides.transition_slide')}</option>
          <option value='zoom'>{t('slides.transition_zoom')}</option>
          <option value='morph'>{t('slides.transition_morph')}</option>
        </select>
      </div>

      <div>
        <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
          {t('slides.speaker_notes')}
        </label>
        <textarea
          rows={5}
          value={slide.notes || ''}
          placeholder={t('slides.speaker_notes_placeholder')}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 outline-none focus:border-[var(--accent)] resize-none leading-relaxed'
        />
      </div>
    </div>
  )
}

function ElementSettingsPanel({
  element,
  onUpdate,
  onDelete,
}: {
  element: SlideElement
  onUpdate: (patch: Partial<SlideElement>) => void
  onDelete: () => void
}) {
  const isText = element.type === 'text'
  const isShape = element.type === 'shape'
  const textEl = isText ? (element as TextElement) : null
  const shapeEl = isShape ? (element as ShapeElement) : null

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]'>
        <span className='font-semibold uppercase tracking-wider text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {element.type}
        </span>
        <button
          type='button'
          onClick={onDelete}
          className='text-[var(--danger)] hover:underline font-medium'
        >
          {t('common.delete')}
        </button>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='block text-[length:var(--text-10)] text-[var(--text-tertiary)] mb-0.5'>{'X'}</label>
          <input
            type='number'
            value={element.x}
            onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono'
          />
        </div>
        <div>
          <label className='block text-[length:var(--text-10)] text-[var(--text-tertiary)] mb-0.5'>{'Y'}</label>
          <input
            type='number'
            value={element.y}
            onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono'
          />
        </div>
        <div>
          <label className='block text-[length:var(--text-10)] text-[var(--text-tertiary)] mb-0.5'>{'W'}</label>
          <input
            type='number'
            value={element.w}
            onChange={(e) => onUpdate({ w: Number(e.target.value) || 10 })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono'
          />
        </div>
        <div>
          <label className='block text-[length:var(--text-10)] text-[var(--text-tertiary)] mb-0.5'>{'H'}</label>
          <input
            type='number'
            value={element.h}
            onChange={(e) => onUpdate({ h: Number(e.target.value) || 10 })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono'
          />
        </div>
      </div>

      {textEl && (
        <div className='space-y-3 pt-2 border-t border-[var(--border-subtle)]'>
          <div>
            <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
              {t('slides.font_size')}
            </label>
            <input
              type='number'
              value={textEl.fontSize}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 16 } as Partial<TextElement>)}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono'
            />
          </div>

          <div>
            <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
              {t('slides.text_align')}
            </label>
            <div className='flex gap-1'>
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type='button'
                  onClick={() => onUpdate({ align } as Partial<TextElement>)}
                  className={`flex-1 py-1 rounded border capitalize ${
                    textEl.align === align
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {align}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {shapeEl && (
        <div className='space-y-3 pt-2 border-t border-[var(--border-subtle)]'>
          <div>
            <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
              {t('slides.fill_color')}
            </label>
            <input
              type='text'
              value={shapeEl.fill}
              onChange={(e) => onUpdate({ fill: e.target.value } as Partial<ShapeElement>)}
              className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[length:var(--text-11)]'
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeSettingsPanel({
  theme,
  onUpdate,
}: {
  theme: SlidesTheme
  onUpdate: (patch: Partial<SlidesTheme>) => void
}) {
  return (
    <div className='space-y-4'>
      <div>
        <span className='block font-semibold mb-2 text-[var(--text-secondary)]'>
          {t('slides.theme_presets')}
        </span>
        <div className='grid grid-cols-2 gap-2'>
          {SLIDE_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type='button'
              onClick={() =>
                onUpdate({
                  background: preset.background,
                  color: preset.color,
                  accent: preset.accent,
                })
              }
              className='flex flex-col gap-1 p-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left transition-colors'
            >
              <div
                style={{ backgroundColor: preset.background }}
                className='h-7 w-full rounded border border-white/10 flex items-center justify-center'
              >
                <div style={{ backgroundColor: preset.accent }} className='size-2.5 rounded-full' />
              </div>
              <span className='text-[length:var(--text-10)] font-medium truncate'>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className='space-y-3 pt-3 border-t border-[var(--border-subtle)]'>
        <div>
          <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
            {t('slides.theme_background')}
          </label>
          <input
            type='text'
            value={theme.background}
            onChange={(e) => onUpdate({ background: e.target.value })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[length:var(--text-11)]'
          />
        </div>

        <div>
          <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
            {t('slides.theme_color')}
          </label>
          <input
            type='text'
            value={theme.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[length:var(--text-11)]'
          />
        </div>

        <div>
          <label className='block font-semibold mb-1 text-[var(--text-secondary)]'>
            {t('slides.theme_accent')}
          </label>
          <input
            type='text'
            value={theme.accent}
            onChange={(e) => onUpdate({ accent: e.target.value })}
            className='w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[length:var(--text-11)]'
          />
        </div>
      </div>
    </div>
  )
}
