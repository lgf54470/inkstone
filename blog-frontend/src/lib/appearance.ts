import type { BlogLocale } from './i18n'
import { isSupportedLocale, LOCALE_COOKIE_NAME, LOCALE_STORAGE_KEY } from './i18n'

export type ThemeMode = 'system' | 'light' | 'dark'
export type AccentColor =
  | 'cinnabar'
  | 'indigo'
  | 'celadon'
  | 'amber'
  | 'terracotta'
  | 'wisteria'
  | 'graphite'
export type BackgroundMode = 'paper' | 'white'
export type DensityMode = 'comfortable' | 'compact'

export interface AppearanceConfig {
  theme: ThemeMode
  accent: AccentColor
  background: BackgroundMode
  density: DensityMode
  lang: BlogLocale
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  theme: 'system',
  accent: 'cinnabar',
  background: 'paper',
  density: 'comfortable',
  lang: 'zh-CN',
}

export const ACCENT_OPTIONS: { id: AccentColor; name: string }[] = [
  { id: 'cinnabar', name: '朱砂' },
  { id: 'indigo', name: '靛蓝' },
  { id: 'celadon', name: '青瓷' },
  { id: 'amber', name: '琥珀' },
  { id: 'terracotta', name: '黛青' },
  { id: 'wisteria', name: '紫藤' },
  { id: 'graphite', name: '石墨' },
]

const STORAGE_KEY = 'inkstone-blog-appearance'

function detectClientLocale(): BlogLocale {
  if (typeof document !== 'undefined') {
    const docLang = document.documentElement.getAttribute('lang')
    if (isSupportedLocale(docLang)) return docLang
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isSupportedLocale(stored)) return stored
  }
  return 'zh-CN'
}

export function getSavedAppearance(): AppearanceConfig {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const baseLocale = detectClientLocale()
    if (!raw) return { ...DEFAULT_APPEARANCE, lang: baseLocale }
    const parsed = JSON.parse(raw) as Partial<AppearanceConfig>
    const lang = isSupportedLocale(parsed.lang) ? parsed.lang : baseLocale
    return { ...DEFAULT_APPEARANCE, ...parsed, lang }
  } catch (e) {
    console.warn('Failed to read saved appearance, using defaults:', e)
    return DEFAULT_APPEARANCE
  }
}

export function applyAppearance(config: AppearanceConfig) {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  // Theme
  let resolvedTheme = config.theme
  if (resolvedTheme === 'system') {
    resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  root.setAttribute('data-theme', resolvedTheme)

  // Accent
  root.setAttribute('data-accent', config.accent)

  // Background
  root.setAttribute('data-background', config.background)

  // Density
  root.setAttribute('data-density', config.density)

  // Language
  root.setAttribute('lang', config.lang)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    localStorage.setItem(LOCALE_STORAGE_KEY, config.lang)
    localStorage.setItem('inkstone_locale', config.lang)
    document.cookie = `${LOCALE_COOKIE_NAME}=${config.lang}; path=/; max-age=31536000; SameSite=Lax`
    document.cookie = `inkstone_locale=${config.lang}; path=/; max-age=31536000; SameSite=Lax`
  } catch (e) {
    console.warn('Failed to persist appearance:', e)
  }

  window.dispatchEvent(new CustomEvent('inkstone-appearance-change', { detail: config }))
  window.dispatchEvent(new CustomEvent('inkstone-locale-change', { detail: config.lang }))
}

