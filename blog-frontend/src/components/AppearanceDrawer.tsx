import { useState, useEffect, type ReactNode } from 'react'
import { X, Palette, Sun, Moon, Monitor, RotateCcw, type LucideIcon } from 'lucide-react'
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

interface PickerProps {
  config: AppearanceConfig
  update: (partial: Partial<AppearanceConfig>) => void
}

interface ChoiceOption<T extends string> {
  id: T
  label: string
  desc?: string
}

const THEME_OPTIONS: ChoiceOption<ThemeMode>[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '明亮模式' },
  { id: 'dark', label: '深邃模式' },
]

const BACKGROUND_OPTIONS: ChoiceOption<BackgroundMode>[] = [
  { id: 'paper', label: '暖纸质感', desc: '柔和护眼纸张色' },
  { id: 'white', label: '纯粹底色', desc: '极简高对比底色' },
]

const DENSITY_OPTIONS: ChoiceOption<DensityMode>[] = [
  { id: 'comfortable', label: '舒适舒展', desc: '16px / 1.65' },
  { id: 'compact', label: '紧凑高效', desc: '15px / 1.55' },
]

function useAppearanceDrawerState() {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT_APPEARANCE)

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
  }

  const resetToDefault = () => {
    setConfig(DEFAULT_APPEARANCE)
    applyAppearance(DEFAULT_APPEARANCE)
  }

  return { isOpen, config, update, resetToDefault, close: () => setIsOpen(false) }
}

export default function AppearanceDrawer() {
  const { isOpen, config, update, resetToDefault, close } = useAppearanceDrawerState()

  return (
    <DrawerLayer isOpen={isOpen} onClose={close} ariaHidden={!isOpen}>
      <DrawerHeader onClose={close} />
      <DrawerBody config={config} update={update} />
      <DrawerFooter onReset={resetToDefault} onDone={close} />
    </DrawerLayer>
  )
}

function DrawerLayer({
  isOpen,
  onClose,
  ariaHidden,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  ariaHidden: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex justify-end transition-[visibility] duration-250 ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={ariaHidden}
    >
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-250 ease-out ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        className={`relative w-full max-w-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border-l border-[var(--border-default)] shadow-2xl flex flex-col h-full z-10 transition-transform duration-250 ease-out transform will-change-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="外观偏好设置"
      >
        {children}
      </aside>
    </div>
  )
}

function DrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] shrink-0">
      <div className="flex items-center gap-2">
        <Palette className="w-5 h-5 text-[var(--accent)]" />
        <h2 className="font-semibold text-base text-[var(--text-primary)]">外观偏好设置</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        aria-label="关闭"
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
          ? 'border-[var(--accent)] bg-[var(--accent-softer)] text-[var(--accent)] font-semibold shadow-xs'
          : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{children}</span>
    </button>
  )
}

function ThemePicker({ config, update }: PickerProps) {
  return (
    <PickerSection title="主题模式" gridClass="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map((option) => (
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
  return (
    <PickerSection title="强调色盘 (东方雅色)" gridClass="grid grid-cols-4 gap-2.5">
      {ACCENT_OPTIONS.map((item) => {
        const active = config.accent === item.id
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
              className="accent-swatch w-5 h-5 rounded-full shadow-xs transition-transform group-hover:scale-110 flex items-center justify-center"
              data-accent={item.id}
            >
              {active && <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />}
            </span>
            <span className="text-[11px] truncate w-full text-center">{item.name}</span>
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
  return (
    <PickerSection title="底色风格" gridClass="grid grid-cols-2 gap-2">
      {BACKGROUND_OPTIONS.map((option) => {
        const active = config.background === option.id
        return (
          <TwoLineChoice
            key={option.id}
            active={active}
            onClick={() => update({ background: option.id })}
            title={option.label}
            desc={option.desc ?? ''}
          />
        )
      })}
    </PickerSection>
  )
}

function DensityPicker({ config, update }: PickerProps) {
  return (
    <PickerSection title="排版密度" gridClass="grid grid-cols-2 gap-2">
      {DENSITY_OPTIONS.map((option) => {
        const active = config.density === option.id
        return (
          <TwoLineChoice
            key={option.id}
            active={active}
            onClick={() => update({ density: option.id })}
            title={option.label}
            desc={option.desc ?? ''}
          />
        )
      })}
    </PickerSection>
  )
}

function DrawerFooter({ onReset, onDone }: { onReset: () => void; onDone: () => void }) {
  return (
    <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-raised)] flex items-center justify-between shrink-0">
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1.5 rounded transition-colors cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>恢复默认</span>
      </button>
      <button
        type="button"
        onClick={onDone}
        className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white font-medium text-xs hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
      >
        完成
      </button>
    </div>
  )
}