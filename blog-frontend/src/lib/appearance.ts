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
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  theme: 'system',
  accent: 'cinnabar',
  background: 'paper',
  density: 'comfortable',
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

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (e) {
    console.warn('Failed to persist appearance:', e)
  }

  window.dispatchEvent(new CustomEvent('inkstone-appearance-change', { detail: config }))
}
