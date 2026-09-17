import { memo } from 'react'
import type { SlidesTheme } from '../types'
import { InspectorSection } from './inspector-section'
import { t } from '../../../i18n'

const DEFAULT_THEME_BG = '#0D1B2E'
const DEFAULT_THEME_TEXT = '#FFFFFF'
const DEFAULT_THEME_ACCENT = '#FF9E8A'

const DEFAULT_CODE_COMMENT = '#6B7F8F'
const DEFAULT_CODE_STRING = '#C98A3E'
const DEFAULT_CODE_NUMBER = '#B0688F'
const DEFAULT_CODE_KEYWORD = '#5B8DEF'
const DEFAULT_CODE_CALL = '#3FA9A0'
const DEFAULT_CODE_PUNCTUATION = '#7C8794'

interface InspectorThemeProps {
  theme: SlidesTheme
  onUpdateTheme: (patch: Partial<SlidesTheme>) => void
}

export const InspectorTheme = memo(function InspectorTheme({
  theme,
  onUpdateTheme,
}: InspectorThemeProps) {
  const codePalette = theme.codePalette || {}

  const handleUpdateCodeScope = (scope: string, color: string) => {
    onUpdateTheme({
      codePalette: {
        ...codePalette,
        [scope]: color,
      },
    })
  }

  return (
    <InspectorSection title={t('slides.tab_theme')} defaultOpen={true}>
      <div className='space-y-3 text-xs'>
        <div className='text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)] bg-[var(--bg-inset)] rounded-md p-2'>
          {t('slides.theme_hint')}
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.theme_background')}</span>
            <input
              type='color'
              value={theme.background.startsWith('#') ? theme.background : DEFAULT_THEME_BG}
              onChange={(e) => onUpdateTheme({ background: e.target.value })}
              className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
            />
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.theme_color')}</span>
            <input
              type='color'
              value={theme.color.startsWith('#') ? theme.color : DEFAULT_THEME_TEXT}
              onChange={(e) => onUpdateTheme({ color: e.target.value })}
              className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
            />
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-[var(--text-secondary)]'>{t('slides.theme_accent')}</span>
            <input
              type='color'
              value={theme.accent.startsWith('#') ? theme.accent : DEFAULT_THEME_ACCENT}
              onChange={(e) => onUpdateTheme({ accent: e.target.value })}
              className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
            />
          </div>
        </div>

        <div className='pt-2 border-t border-[var(--border-subtle)] space-y-2'>
          <div className='text-[length:var(--text-11)] leading-relaxed text-[var(--text-tertiary)] bg-[var(--bg-inset)] rounded-md p-2'>
            {t('slides.code_palette_hint')}
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_comment')}</span>
              <input
                type='color'
                value={codePalette.c || DEFAULT_CODE_COMMENT}
                onChange={(e) => handleUpdateCodeScope('c', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_string')}</span>
              <input
                type='color'
                value={codePalette.s || DEFAULT_CODE_STRING}
                onChange={(e) => handleUpdateCodeScope('s', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_number')}</span>
              <input
                type='color'
                value={codePalette.n || DEFAULT_CODE_NUMBER}
                onChange={(e) => handleUpdateCodeScope('n', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_keyword')}</span>
              <input
                type='color'
                value={codePalette.k || DEFAULT_CODE_KEYWORD}
                onChange={(e) => handleUpdateCodeScope('k', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_call')}</span>
              <input
                type='color'
                value={codePalette.f || DEFAULT_CODE_CALL}
                onChange={(e) => handleUpdateCodeScope('f', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>

            <div className='flex items-center justify-between'>
              <span className='text-[var(--text-secondary)]'>{t('slides.code_punctuation')}</span>
              <input
                type='color'
                value={codePalette.p || DEFAULT_CODE_PUNCTUATION}
                onChange={(e) => handleUpdateCodeScope('p', e.target.value)}
                className='w-28 h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 cursor-pointer'
              />
            </div>
          </div>
        </div>
      </div>
    </InspectorSection>
  )
})
