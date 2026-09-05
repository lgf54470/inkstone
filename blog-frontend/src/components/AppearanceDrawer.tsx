import React, { useState, useEffect } from 'react'
import {
  X,
  Palette,
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  Languages,
  RotateCcw,
} from 'lucide-react'
import {
  type AppearanceConfig,
  type AccentColor,
  type ThemeMode,
  type BackgroundMode,
  type DensityMode,
  type LanguageMode,
  DEFAULT_APPEARANCE,
  ACCENT_OPTIONS,
  getSavedAppearance,
  applyAppearance,
} from '../lib/appearance'

export default function AppearanceDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const initial = getSavedAppearance()
    setConfig(initial)

    const handleOpen = () => setIsOpen(true)
    const handleClose = () => setIsOpen(false)
    const handleToggle = () => setIsOpen((prev) => !prev)

    window.addEventListener('open-appearance-drawer', handleOpen)
    window.addEventListener('close-appearance-drawer', handleClose)
    window.addEventListener('toggle-appearance-drawer', handleToggle)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
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

  const isZh = config.lang === 'zh-CN'

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex justify-end transition-[visibility] duration-250 ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-250 ease-out ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer Panel */}
      <aside
        className={`relative w-full max-w-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border-l border-[var(--border-default)] shadow-2xl flex flex-col h-full z-10 transition-transform duration-250 ease-out transform will-change-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Appearance Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] shrink-0">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-semibold text-base text-[var(--text-primary)]">
              {isZh ? '外观偏好设置' : 'Appearance Settings'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
          {/* Theme Mode */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              {isZh ? '主题模式' : 'Theme Mode'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'system', icon: Monitor, label: isZh ? '跟随系统' : 'System' },
                { id: 'light', icon: Sun, label: isZh ? '明亮模式' : 'Light' },
                { id: 'dark', icon: Moon, label: isZh ? '深邃模式' : 'Dark' },
              ].map(({ id, icon: Icon, label }) => {
                const active = config.theme === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ theme: id as ThemeMode })}
                    className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-softer)] text-[var(--accent)] font-semibold shadow-xs'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              {isZh ? '强调色盘 (东方雅色)' : 'Accent Color'}
            </label>
            <div className="grid grid-cols-4 gap-2.5">
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
                    <span className="text-[11px] truncate w-full text-center">
                      {isZh ? item.name : item.nameEn}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Background Style */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              {isZh ? '底色风格' : 'Background Canvas'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'paper', label: isZh ? '暖纸质感' : 'Paper Tone', desc: isZh ? '柔和护眼纸张色' : 'Soft natural paper' },
                { id: 'white', label: isZh ? '纯粹底色' : 'Pure Minimal', desc: isZh ? '极简高对比底色' : 'High contrast pure' },
              ].map(({ id, label, desc }) => {
                const active = config.background === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ background: id as BackgroundMode })}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-softer)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className={`text-xs font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      {label}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* UI Density */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              {isZh ? '排版密度' : 'Layout Density'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'comfortable', label: isZh ? '舒适舒展' : 'Comfortable', desc: '16px / 1.65' },
                { id: 'compact', label: isZh ? '紧凑高效' : 'Compact', desc: '15px / 1.55' },
              ].map(({ id, label, desc }) => {
                const active = config.density === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ density: id as DensityMode })}
                    className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-softer)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className={`text-xs font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      {label}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Language Selection */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              {isZh ? '界面语言' : 'Language'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'zh-CN', label: '简体中文' },
                { id: 'en-US', label: 'English' },
              ].map(({ id, label }) => {
                const active = config.lang === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => update({ lang: id as LanguageMode })}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-softer)] text-[var(--accent)] font-semibold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-raised)] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={resetToDefault}
            className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-2 py-1.5 rounded transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isZh ? '恢复默认' : 'Reset Defaults'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white font-medium text-xs hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
          >
            {isZh ? '完成' : 'Done'}
          </button>
        </div>
      </aside>
    </div>
  )
}
