import { useCallback, useMemo } from 'react'
import type { AccentName, AppLocale, BackgroundName, ProseFont, ProseWidth, ThemePref, UiDensity } from '@shared/types'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { YearGrid } from '../../components/calendar-grids'
import { cn } from '../../lib/cn'
import { Segmented, SettingRow, Slider, Switch, type SegmentedOption } from '../../components/form'
import { useUi } from '../../store/ui'
import { setCalendarTreeShowEmpty, setCalendarTreeVisible, useCalendarTreeShowEmpty, useCalendarTreeVisible } from '../../lib/calendar-prefs'
import { setYearGridColumns, useYearGridColumns, type YearGridColumnsPref } from '../../lib/year-grid-prefs'
import { Tooltip } from '../../components/overlay'
import { useSession } from '../../store/session'
import { switchThemeWithTransition } from '../../store/ui'
import { t, useLocale, type MessageKey } from '../../lib/i18n'

const ACCENT_MESSAGE_KEYS: Record<AccentName, MessageKey> = {
  cinnabar: 'settings.accent.cinnabar',
  indigo: 'settings.accent.indigo',
  celadon: 'settings.accent.celadon',
  amber: 'settings.accent.amber',
  terracotta: 'settings.accent.terracotta',
  wisteria: 'settings.accent.wisteria',
  graphite: 'settings.accent.graphite',
}

export function AppearanceSettings({
  accents,
}: {
  accents: { name: AccentName; swatch: string; foreground: string }[]
}) {
  const appearance = useSession((s) => s.settings.appearance)
  const update = useSession((s) => s.updateSettings)
  const locale = useLocale()
  const calendarTreeVisible = useCalendarTreeVisible()
  const calendarTreeShowEmpty = useCalendarTreeShowEmpty()
  const yearGridColumns = useYearGridColumns()

  const setLanguage = useCallback((language: AppLocale) => void update({ appearance: { language } }), [update])
  const setTheme = useCallback((theme: ThemePref) => {
    switchThemeWithTransition(theme, undefined, () => update({ appearance: { theme } }))
  }, [update])
  const setDensity = useCallback((density: UiDensity) => void update({ appearance: { density } }), [update])
  const setProseFont = useCallback((proseFont: ProseFont) => void update({ appearance: { proseFont } }), [update])
  const setProseSize = useCallback((proseSize: number) => void update({ appearance: { proseSize } }), [update])
  const setProseLineHeight = useCallback((proseLineHeight: number) => void update({ appearance: { proseLineHeight } }), [update])
  const setProseWidth = useCallback((proseWidth: ProseWidth) => void update({ appearance: { proseWidth } }), [update])

  const languageOptions: SegmentedOption<AppLocale>[] = useMemo(() => ([
    { value: 'zh-CN', label: t("settings.simplified_chinese") },
    { value: 'en-US', label: t("settings.english") },
  ]), [locale])

  const themeOptions: SegmentedOption<ThemePref>[] = useMemo(() => ([
    { value: 'light', label: <Sun size={12.5} />, title: t("settings.light") },
    { value: 'dark', label: <Moon size={12.5} />, title: t("settings.dark") },
    { value: 'system', label: <Monitor size={12.5} />, title: t("settings.system") },
  ]), [locale])

  const densityOptions: SegmentedOption<UiDensity>[] = useMemo(() => ([
    { value: 'comfortable', label: t("settings.comfortable") },
    { value: 'compact', label: t("settings.compact") },
  ]), [locale])

  const proseFontOptions: SegmentedOption<ProseFont>[] = useMemo(() => ([
    { value: 'sans', label: t("common.sans_serif") },
    { value: 'serif', label: t("settings.serif") },
  ]), [locale])

  const proseWidthOptions: SegmentedOption<ProseWidth>[] = useMemo(() => ([
    { value: 'narrow', label: t("settings.narrow") },
    { value: 'normal', label: t("settings.standard") },
    { value: 'wide', label: t("settings.wide") },
    { value: 'full', label: t("settings.full") },
  ]), [locale])

  const yearGridOptions: SegmentedOption<YearGridColumnsPref>[] = useMemo(() => ([
    { value: 'auto', label: t("settings.year_grid_columns_auto") },
    { value: '3', label: t("settings.year_grid_columns_three") },
    { value: '4', label: t("settings.year_grid_columns_four") },
  ]), [locale])

  return (
    <div>
      <section>
        <SettingRow title={t("settings.interface_language")}>
          <Segmented<AppLocale>
            label={t("settings.interface_language")}
            value={appearance.language}
            onChange={setLanguage}
            options={languageOptions}
          />
        </SettingRow>

        <SettingRow title={t("settings.theme")}>
          <Segmented<ThemePref>
            label={t("settings.theme")}
            value={appearance.theme}
            onChange={setTheme}
            options={themeOptions}
          />
        </SettingRow>

        <SettingRow title={t("settings.accent_color")}>
          <div role="group" aria-label={t("settings.accent_color")} className="flex items-center gap-1.5">
            {accents.map((accent) => (
              <Tooltip key={accent.name} label={t(ACCENT_MESSAGE_KEYS[accent.name])}>
                <button
                  type="button"
                  onClick={() => void update({ appearance: { accent: accent.name } })}
                  aria-label={t(ACCENT_MESSAGE_KEYS[accent.name])}
                  aria-pressed={appearance.accent === accent.name}
                  className={cn(
                    'relative flex size-6 items-center justify-center rounded-full transition-transform duration-[var(--dur-fast)] ease-[var(--ease-spring)]',
                    'hover:scale-110 active:scale-95',
                    appearance.accent === accent.name && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-overlay)]',
                  )}
                  style={{ background: accent.swatch, color: accent.foreground }}
                >
                  {appearance.accent === accent.name && (
                    <Check size={12} strokeWidth={3} className="drop-shadow-sm" />
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        </SettingRow>

        <SettingRow title={t("settings.background_color")}>
          <div role="group" aria-label={t("settings.background_color")} className="flex items-center gap-2">
            {([
              { name: 'paper', label: t("settings.background_paper"), swatch: '#f7f5f1' },
              { name: 'white', label: t("settings.background_white"), swatch: '#ffffff' },
            ] satisfies { name: BackgroundName; label: string; swatch: string }[]).map((background) => (
              <button
                key={background.name}
                type="button"
                onClick={() => void update({ appearance: { background: background.name } })}
                aria-pressed={appearance.background === background.name}
                className={cn(
                  'flex h-8 min-w-[84px] items-center gap-2 rounded-[var(--r-md)] border px-2.5 text-[11.5px] transition-[border-color,background-color,box-shadow] duration-[var(--dur-fast)]',
                  appearance.background === background.name
                    ? 'border-[var(--accent)] bg-[var(--accent-softer)] shadow-[0_0_0_2px_var(--accent-ring)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full border border-black/10 shadow-sm"
                  style={{ background: background.swatch }}
                />
                <span>{background.label}</span>
                {appearance.background === background.name && <Check size={11} className="ml-auto text-[var(--accent)]" />}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow title={t("settings.interface_density")}>
          <Segmented<UiDensity>
            label={t("settings.interface_density")}
            value={appearance.density}
            onChange={setDensity}
            options={densityOptions}
          />
        </SettingRow>

        <SettingRow title={t("settings.sidebar_calendar_tree")} description={t("settings.sidebar_calendar_tree_desc")}>
          <Switch checked={calendarTreeVisible} onChange={setCalendarTreeVisible} label={t("settings.sidebar_calendar_tree")}/>
        </SettingRow>

        <SettingRow title={t("settings.show_empty_calendar_periods")} description={t("settings.show_empty_calendar_periods_desc")}>
          <Switch checked={calendarTreeShowEmpty} onChange={setCalendarTreeShowEmpty} label={t("settings.show_empty_calendar_periods")}/>
        </SettingRow>

        <SettingRow title={t("settings.year_grid_columns")} description={t("settings.year_grid_columns_desc")}>
          <Segmented<YearGridColumnsPref>
            label={t("settings.year_grid_columns")}
            value={yearGridColumns}
            onChange={setYearGridColumns}
            options={yearGridOptions}
          />
        </SettingRow>

        <YearGridPreview columns={yearGridColumns} locale={locale}/>
      </section>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
          {t("settings.preview_typography")}
        </h3>

        <SettingRow title={t("settings.body_font")}>
          <Segmented<ProseFont>
            label={t("settings.body_font")}
            value={appearance.proseFont}
            onChange={setProseFont}
            options={proseFontOptions}
          />
        </SettingRow>

        <SettingRow title={t("settings.body_text_size")}>
          <Slider
            label={t("settings.body_text_size")}
            className="w-[200px]"
            value={appearance.proseSize}
            min={13}
            max={22}
            onChange={setProseSize}
            suffix="px"
          />
        </SettingRow>

        <SettingRow title={t("settings.line_height")}>
          <Slider
            label={t("settings.line_height")}
            className="w-[200px]"
            value={appearance.proseLineHeight}
            min={1.4}
            max={2.2}
            step={0.05}
            onChange={setProseLineHeight}
          />
        </SettingRow>

        <SettingRow title={t("settings.content_width")}>
          <Segmented<ProseWidth>
            label={t("settings.content_width")}
            value={appearance.proseWidth}
            onChange={setProseWidth}
            options={proseWidthOptions}
          />
        </SettingRow>
      </section>

      <PreviewSample />
    </div>
  )
}


function YearGridPreview({ columns, locale }: { columns: YearGridColumnsPref; locale: string }) {
  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, month) => formatter.format(new Date(2026, month, 1)))
  }, [locale])
  const previewHeat = [16, 34, 54] as const
  const previewYear = new Date().getFullYear()
  const jumpToMonth = (month: number) => {
    useUi.getState().requestCalendarJump(previewYear, month)
    useUi.getState().closePanel()
  }
  return (
    <div className="mt-1 mb-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-medium text-[var(--text-quaternary)]">{t("settings.year_grid_columns_preview")}</span>
        <span className="text-[9.5px] text-[var(--text-quaternary)]">{t("settings.year_grid_columns_preview_tip")}</span>
      </div>
      <YearGrid
        year={previewYear}
        weekStart={locale === 'zh-CN' ? 1 : 0}
        columns={columns === '4' ? 4 : 3}
        renderMonth={(month) => (
          <button
            key={month.month}
            type="button"
            aria-label={t("settings.year_grid_columns_jump_value0", { value0: monthLabels[month.month] ?? '' })}
            onClick={() => jumpToMonth(month.month)}
            className="flex min-w-0 flex-col items-center gap-0.5 rounded-[3px] p-px transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <span className="text-[7px] font-medium text-[var(--text-quaternary)]">{monthLabels[month.month]}</span>
            <span aria-hidden="true" className="grid w-full grid-cols-7 gap-px">
              {month.cells.map((cell, index) => {
                const level = cell.inMonth ? ((index + month.month) % 4) : 0
                return (
                  <span
                    key={index}
                    className={cn('aspect-square w-full rounded-[1px]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]')}
                    style={{ backgroundColor: !cell.inMonth ? 'transparent' : level === 0 ? 'var(--bg-base)' : `color-mix(in oklab, var(--accent) ${previewHeat[level - 1]}%, transparent)` }}
                  />
                )
              })}
            </span>
          </button>
        )}
      />
    </div>
  )
}

function PreviewSample() {
  const appearance = useSession((s) => s.settings.appearance)
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
        {t("settings.preview")}
      </h3>
      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3">
        <div
          className="ink-prose"
          data-font={appearance.proseFont}
          style={{ maxWidth: 'none', paddingBlock: 0 }}
        >
          <h3 style={{ marginTop: 0 }}>{t("settings.q_a_in_the_mountains")}</h3>
          <p>
            {t("settings.asked_why_i_wanted_to_live_in_the_green_mountains_i_smiled_without_answe")}{' '}
            {t("settings.chinese_english_and")} <code>{t("common.inline_code")}</code> {t("settings.look_at_home_together")}
          </p>
        </div>
      </div>
    </section>
  )
}