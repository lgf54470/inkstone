import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DARK_BG,
  DEFAULT_DARK_COLOR,
  getAdaptiveSlideTheme,
  SLIDE_THEME_PRESETS,
} from './colors'

describe('slide colors and themes', () => {
  it('exports default color constants', () => {
    expect(DEFAULT_DARK_BG).toBe('#0d1117')
    expect(DEFAULT_DARK_COLOR).toBe('#f0f6fc')
    expect(DEFAULT_ACCENT_COLOR).toBe('#3b82f6')
  })

  it('provides slide theme presets', () => {
    expect(SLIDE_THEME_PRESETS.length).toBeGreaterThan(0)
    const bentoDark = SLIDE_THEME_PRESETS.find((p) => p.id === 'bento-dark')
    expect(bentoDark).toBeDefined()
    expect(bentoDark?.background).toBe('#0e131f')
  })

  it('computes adaptive theme for light and dark modes', () => {
    const darkTheme = getAdaptiveSlideTheme(true)
    expect(darkTheme.background).toBe('var(--bg-inset)')
    expect(darkTheme.color).toBe('var(--text-primary)')
    expect(darkTheme.accent).toBe('var(--accent)')

    const lightTheme = getAdaptiveSlideTheme(false)
    expect(lightTheme.background).toBe('var(--bg-surface)')
    expect(lightTheme.color).toBe('var(--text-primary)')
  })
})
