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
export type LanguageMode = 'zh-CN' | 'en-US'

export interface AppearanceConfig {
  theme: ThemeMode
  accent: AccentColor
  background: BackgroundMode
  density: DensityMode
  lang: LanguageMode
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  theme: 'system',
  accent: 'cinnabar',
  background: 'paper',
  density: 'comfortable',
  lang: 'zh-CN',
}

export const ACCENT_OPTIONS: { id: AccentColor; name: string; nameEn: string; color: string }[] = [
  { id: 'cinnabar', name: '朱砂', nameEn: 'Cinnabar', color: 'oklch(54% 0.15 30)' },
  { id: 'indigo', name: '靛蓝', nameEn: 'Indigo', color: 'oklch(52% 0.14 252)' },
  { id: 'celadon', name: '青瓷', nameEn: 'Celadon', color: 'oklch(49% 0.13 150)' },
  { id: 'amber', name: '琥珀', nameEn: 'Amber', color: 'oklch(56% 0.105 95)' },
  { id: 'terracotta', name: '黛青', nameEn: 'Terracotta', color: 'oklch(49% 0.075 205)' },
  { id: 'wisteria', name: '紫藤', nameEn: 'Wisteria', color: 'oklch(52% 0.16 300)' },
  { id: 'graphite', name: '石墨', nameEn: 'Graphite', color: 'oklch(38% 0.03 250)' },
]

const STORAGE_KEY = 'inkstone-blog-appearance'

export function getSavedAppearance(): AppearanceConfig {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
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

  // Lang
  root.setAttribute('lang', config.lang)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (e) {
    console.warn('Failed to persist appearance:', e)
  }

  window.dispatchEvent(new CustomEvent('inkstone-appearance-change', { detail: config }))
}
