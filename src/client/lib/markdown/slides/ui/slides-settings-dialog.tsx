import { memo } from 'react'
import { Modal } from '../../../../components/overlay'
import { Field, Input, Select } from '../../../../components/form'
import { Button } from '../../../../components/primitives'
import { t, type MessageKey } from '../../../i18n'
import type { SlidesTheme } from '../types'

const FONT_DEFAULT = ''
const FONT_SERIF = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
const FONT_SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif"
const FONT_MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, monospace"

const FONT_OPTIONS: { value: string; label: MessageKey }[] = [
  { value: FONT_DEFAULT, label: 'slides.settings_font_default' },
  { value: FONT_SERIF, label: 'slides.settings_font_serif' },
  { value: FONT_SANS, label: 'slides.settings_font_sans' },
  { value: FONT_MONO, label: 'slides.settings_font_mono' },
]

interface SizePreset {
  id: string
  label: MessageKey
  width: number
  height: number
}

const SIZE_PRESETS: SizePreset[] = [
  { id: 'wide', label: 'slides.settings_size_16_9', width: 1280, height: 720 },
  { id: 'hd', label: 'slides.settings_size_1080p', width: 1920, height: 1080 },
  { id: 'classic', label: 'slides.settings_size_4_3', width: 1024, height: 768 },
  { id: 'wide10', label: 'slides.settings_size_16_10', width: 1280, height: 800 },
]

const SETTINGS_DIALOG_WIDTH = 560
const FIELD_LEGEND = 'text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'

const MIN_CANVAS_SIDE = 200
const MAX_CANVAS_SIDE = 4096

// A colour input only accepts `#rrggbb`; a theme written as a named colour or a CSS
// variable keeps its own value until the reader picks a new one here.
const FALLBACK_BACKGROUND = '#0D1B2E'
const FALLBACK_TEXT = '#FFFFFF'
const FALLBACK_ACCENT = '#FF9E8A'

function hexOr(value: string, fallback: string): string {
  return value.startsWith('#') ? value : fallback
}

export interface SlidesSettingsDialogProps {
  open: boolean
  title: string
  size: { width: number; height: number }
  theme: SlidesTheme
  onClose: () => void
  onUpdateTitle: (title: string) => void
  onUpdateSize: (size: { width: number; height: number }) => void
  onUpdateTheme: (patch: Partial<SlidesTheme>) => void
}

function clampSide(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_CANVAS_SIDE, Math.max(MIN_CANVAS_SIDE, Math.round(value)))
}

function SizeFieldset({
  size,
  onUpdateSize,
}: Pick<SlidesSettingsDialogProps, 'size' | 'onUpdateSize'>) {
  return (
    <fieldset className='space-y-2'>
      <legend className={FIELD_LEGEND}>
        {t('slides.settings_size')}
      </legend>
      <div className='flex flex-wrap gap-2'>
        {SIZE_PRESETS.map((preset) => {
          const active = size.width === preset.width && size.height === preset.height
          return (
            <Button
              key={preset.id}
              size='sm'
              variant={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              onClick={() => onUpdateSize({ width: preset.width, height: preset.height })}
            >
              {t(preset.label)}
            </Button>
          )
        })}
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <Field label={t('slides.settings_width')}>
          <Input
            type='number'
            min={MIN_CANVAS_SIDE}
            max={MAX_CANVAS_SIDE}
            value={size.width}
            onChange={(event) =>
              onUpdateSize({ width: clampSide(event.target.valueAsNumber, size.width), height: size.height })
            }
          />
        </Field>
        <Field label={t('slides.settings_height')}>
          <Input
            type='number'
            min={MIN_CANVAS_SIDE}
            max={MAX_CANVAS_SIDE}
            value={size.height}
            onChange={(event) =>
              onUpdateSize({ width: size.width, height: clampSide(event.target.valueAsNumber, size.height) })
            }
          />
        </Field>
      </div>
    </fieldset>
  )
}

function ThemeFieldset({
  theme,
  onUpdateTheme,
}: Pick<SlidesSettingsDialogProps, 'theme' | 'onUpdateTheme'>) {
  const colors = [
    { key: 'background', label: t('slides.theme_background'), fallback: FALLBACK_BACKGROUND },
    { key: 'color', label: t('slides.theme_color'), fallback: FALLBACK_TEXT },
    { key: 'accent', label: t('slides.theme_accent'), fallback: FALLBACK_ACCENT },
  ] as const
  return (
    <fieldset className='space-y-3'>
      <legend className={FIELD_LEGEND}>
        {t('slides.settings_theme')}
      </legend>
      <Field label={t('slides.settings_font')}>
        <Select
          value={theme.fontFamily ?? FONT_DEFAULT}
          onChange={(event) => onUpdateTheme({ fontFamily: event.target.value || undefined })}
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </Select>
      </Field>
      <div className='grid grid-cols-3 gap-3'>
        {colors.map((color) => (
          <Field key={color.key} label={color.label}>
            <Input
              type='color'
              value={hexOr(theme[color.key], color.fallback)}
              onChange={(event) => onUpdateTheme({ [color.key]: event.target.value })}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  )
}

export const SlidesSettingsDialog = memo(function SlidesSettingsDialog({
  open,
  title,
  size,
  theme,
  onClose,
  onUpdateTitle,
  onUpdateSize,
  onUpdateTheme,
}: SlidesSettingsDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('slides.settings_title')}
      description={t('slides.settings_description')}
      width={SETTINGS_DIALOG_WIDTH}
      footer={(
        <Button variant='secondary' onClick={onClose}>
          {t('common.close')}
        </Button>
      )}
    >
      <div className='space-y-5'>
        <Field label={t('slides.settings_deck_title')}>
          <Input
            type='text'
            value={title}
            onChange={(event) => onUpdateTitle(event.target.value)}
            placeholder={t('slides.click_to_edit_title')}
          />
        </Field>

        <SizeFieldset size={size} onUpdateSize={onUpdateSize} />
        <ThemeFieldset theme={theme} onUpdateTheme={onUpdateTheme} />
      </div>
    </Modal>
  )
})
