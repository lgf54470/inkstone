export interface SlideColorPreset {
  id: string
  name: string
  background: string
  color: string
  accent: string
}

export const DEFAULT_DARK_BG = '#0d1117'
export const DEFAULT_DARK_COLOR = '#f0f6fc'
export const DEFAULT_ACCENT_COLOR = '#3b82f6'

export const SLIDE_THEME_PRESETS: SlideColorPreset[] = [
  {
    id: 'bento-dark',
    name: 'Bento Dark',
    background: '#0e131f',
    color: '#e2e8f0',
    accent: '#e26d5c',
  },
  {
    id: 'clean-light',
    name: 'Clean Light',
    background: '#f8fafc',
    color: '#0f172a',
    accent: '#2563eb',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Navy',
    background: '#0b132b',
    color: '#e0e1dd',
    accent: '#48cae4',
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    background: '#1c1917',
    color: '#f5f5f4',
    accent: '#f59e0b',
  },
  {
    id: 'emerald-forest',
    name: 'Emerald',
    background: '#06281e',
    color: '#ecfdf5',
    accent: '#10b981',
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    background: '#130d24',
    color: '#f3e8ff',
    accent: '#a855f7',
  },
]

export function getAdaptiveSlideTheme(dark: boolean): {
  background: string
  color: string
  accent: string
} {
  return dark
    ? {
        background: 'var(--bg-inset)',
        color: 'var(--text-primary)',
        accent: 'var(--accent)',
      }
    : {
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        accent: 'var(--accent)',
      }
}
