import { useState, useEffect, type ReactNode } from 'react'
import { X, Palette, Sun, Moon, Monitor, RotateCcw, Languages, type LucideIcon } from 'lucide-react'
import {
  type AppearanceConfig,
  type ThemeMode,
  type BackgroundMode,
  type DensityMode,
  DEFAULT_APPEARANCE,
  ACCENT_OPTIONS,
  getSavedAppearance,
  applyAppearance,
} from '../lib/appearance'
import { t, type BlogLocale } from '../lib/i18n'

interface DrawerProps {
  initialLocale?: BlogLocale
}

interface PickerProps {
  config: AppearanceConfig
  update: (partial: Partial<AppearanceConfig>) => void
}

const LANGUAGE_OPTIONS: { id: BlogLocale; label: string }[] = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en-US', label: 'English' },
]

function useAppearanceDrawerState(initialLocale?: BlogLocale) {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<AppearanceConfig>(() => ({
    ...DEFAULT_APPEARANCE,
    lang: initialLocale ?? DEFAULT_APPEARANCE.lang,
  }))

  useEffect(() => {
    setConfig(getSavedAppearance())

    const handleOpen = () => setIsOpen(true)
    const handleClose = () => setIsOpen(false)
    const handleToggle = () => setIsOpen((prev) => !prev)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('open-appearance-drawer', handleOpen)
    window.addEventListener('close-appearance-drawer', handleClose)
    window.addEventListener('toggle-appearance-drawer', handleToggle)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('open-appearance-drawer', handleOpen)
      window.removeEventListener('close-appearance-drawer', handleClose)
      window.removeEventListener('toggle-appearance-drawer', handleToggle)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const update = (partial: Partial<AppearanceConfig>) => {
    const next = { ...config, ...partial }
    setConfig(next)
    applyAppearance(next)
    if (partial.lang && partial.lang !== config.lang) {
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 80)
      }
    }
  }

  const resetToDefault = () => {
    const next = { ...DEFAULT_APPEARANCE, lang: config.lang }
    setConfig(next)
    applyAppearance(next)
  }

  return { isOpen, config, update, resetToDefault, close: () => setIsOpen(false) }
}

export default function AppearanceDrawer({ initialLocale }: DrawerProps) {
  const { isOpen, config, update, resetToDefault, close } = useAppearanceDrawerState(initialLocale)
  const lang = config.lang

  return (
    <DrawerLayer isOpen={isOpen} onClose={close} ariaHidden={!isOpen} title={t('appearance.title', {}, lang)}>
      <DrawerHeader onClose={close} lang={lang} />
      <DrawerBody config={config} update={update} />
      <DrawerFooter onReset={resetToDefault} onDone={close} lang={lang} />
    </DrawerLayer>
  )
}

function DrawerLayer({
  isOpen,
  onClose,
  ariaHidden,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  ariaHidden: boolean
  title: string
  children: ReactNode
}) {
  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex justify-end transition-[visibility] duration-[var(--dur-base)] ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={ariaHidden}
    >
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)] ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`relative w-full max-w-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border-l border-[var(--border-default)] shadow-[var(--shadow-modal)] flex flex-col h-full z-10 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] transform will-change-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </aside>
    </div>
  )
}

function DrawerHeader({ onClose, lang }: { onClose: () => void; lang: BlogLocale }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] shrink-0">
      <div className="flex items-center gap-2">
        <Palette className="w-5 h-5 text-[var(--accent)]" />
        <h2 className="font-semibold text-base text-[var(--text-primary)]">
          {t('appearance.title', {}, lang)}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        aria-label={t('appearance.close', {}, lang)}
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}

function DrawerBody({ config, update }: PickerProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
      <ThemePicker config={config} update={update} />
      <AccentPicker config={config} update={update} />
      <BackgroundPicker config={config} update={update} />
      <DensityPicker config={config} update={update} />
      <LanguagePicker config={config} update={update} />
    </div>
  )
}

function PickerSection({
  title,
  gridClass,
  children,
}: {
  title: string
  gridClass: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
        {title}
      </label>
      <div className={gridClass}>{children}</div>
    </div>
  )
}

function IconChoice({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: LucideIcon
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-softer)] text-[var(--accent)] font-semibold shadow-[var(--shadow-xs)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{children}</span>
    </button>
  )
}

function ThemePicker({ config, update }: PickerProps) {
  const lang = config.lang
  const themeOptions: { id: ThemeMode; label: string }[] = [
    { id: 'system', label: t('appearance.theme_system', {}, lang) },
    { id: 'light', label: t('appearance.theme_light', {}, lang) },
    { id: 'dark', label: t('appearance.theme_dark', {}, lang) },
  ]

  return (
    <PickerSection title={t('appearance.theme', {}, lang)} gridClass="grid grid-cols-3 gap-2">
      {themeOptions.map((option) => (
        <IconChoice
          key={option.id}
          icon={iconForTheme(option.id)}
          active={config.theme === option.id}
          onClick={() => update({ theme: option.id })}
        >
          {option.label}
        </IconChoice>
      ))}
    </PickerSection>
  )
}

function iconForTheme(id: ThemeMode): LucideIcon {
  const icons: Record<ThemeMode, LucideIcon> = {
    system: Monitor,
    light: Sun,
    dark: Moon,
  }
  return icons[id]
}

function AccentPicker({ config, update }: PickerProps) {
  const lang = config.lang
  const accentKeyMap: Record<string, Parameters<typeof t>[0]> = {
    cinnabar: 'appearance.accent_cinnabar',
    indigo: 'appearance.accent_indigo',
    celadon: 'appearance.accent_celadon',
    amber: 'appearance.accent_amber',
    terracotta: 'appearance.accent_terracotta',
    wisteria: 'appearance.accent_wisteria',
    graphite: 'appearance.accent_graphite',
  }

  return (
    <PickerSection title={t('appearance.accent', {}, lang)} gridClass="grid grid-cols-4 gap-2.5">
      {ACCENT_OPTIONS.map((item) => {
        const active = config.accent === item.id
        const label = t(accentKeyMap[item.id] || 'appearance.accent_cinnabar', {}, lang)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => update({ accent: item.id })}
            className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-softer)] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]'
                : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
            }`}
          >
            <span
              className="accent-swatch w-5 h-5 rounded-full shadow-[var(--shadow-xs)] transition-transform group-hover:scale-110 flex items-center justify-center"
              data-accent={item.id}
            >
              {active && <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[var(--shadow-xs)]" />}
            </span>
            <span className="text-[11px] truncate w-full text-center">{label}</span>
          </button>
        )
      })}
    </PickerSection>
  )
}

function TwoLineChoice({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-softer)] ring-1 ring-[var(--accent)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <div className={`text-xs font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
        {title}
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{desc}</div>
    </button>
  )
}

function BackgroundPicker({ config, update }: PickerProps) {
  const lang = config.lang
  const backgroundOptions: { id: BackgroundMode; label: string; desc: string }[] = [
    { id: 'paper', label: t('appearance.bg_paper', {}, lang), desc: t('appearance.bg_paper_desc', {}, lang) },
    { id: 'white', label: t('appearance.bg_white', {}, lang), desc: t('appearance.bg_white_desc', {}, lang) },
  ]

  return (
    <PickerSection title={t('appearance.background', {}, lang)} gridClass="grid grid-cols-2 gap-2">
      {backgroundOptions.map((option) => (
        <TwoLineChoice
          key={option.id}
          active={config.background === option.id}
          onClick={() => update({ background: option.id })}
          title={option.label}
          desc={option.desc}
        />
      ))}
    </PickerSection>
  )
}

function DensityPicker({ config, update }: PickerProps) {
  const lang = config.lang
  const densityOptions: { id: DensityMode; label: string; desc: string }[] = [
    {
      id: 'comfortable',
      label: t('appearance.density_comfortable', {}, lang),
      desc: t('appearance.density_comfortable_desc', {}, lang),
    },
    {
      id: 'compact',
      label: t('appearance.density_compact', {}, lang),
      desc: t('appearance.density_compact_desc', {}, lang),
    },
  ]

  return (
    <PickerSection title={t('appearance.density', {}, lang)} gridClass="grid grid-cols-2 gap-2">
      {densityOptions.map((option) => (
        <TwoLineChoice
          key={option.id}
          active={config.density === option.id}
          onClick={() => update({ density: option.id })}
          title={option.label}
          desc={option.desc}
        />
      ))}
    </PickerSection>
  )
}

function LanguagePicker({ config, update }: PickerProps) {
  const lang = config.lang

  return (
    <PickerSection title={t('appearance.language', {}, lang)} gridClass="grid grid-cols-3 gap-2">
      {LANGUAGE_OPTIONS.map((option) => {
        const active = config.lang === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => update({ lang: option.id })}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-softer)] text-[var(--accent)] font-semibold shadow-[var(--shadow-xs)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Languages className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </PickerSection>
  )
}

function DrawerFooter({
  onReset,
  onDone,
  lang,
}: {
  onReset: () => void
  onDone: () => void
  lang: BlogLocale
}) {
  return (
    <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-raised)] flex items-center justify-between shrink-0">
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1.5 rounded transition-colors cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>{t('appearance.reset', {}, lang)}</span>
      </button>
      <button
        type="button"
        onClick={onDone}
        className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white font-medium text-xs hover:opacity-90 transition-opacity shadow-[var(--shadow-xs)] cursor-pointer"
      >
        {t('appearance.done', {}, lang)}
      </button>
    </div>
  )
}