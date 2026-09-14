import { describe, expect, it } from 'vitest'
import { APP_THEME_CHOICE, readThemeChoice, resolveThemeChoice } from './theme'

describe('mind map body theme — the field a note may write', () => {
  it('follows the app when the body names no theme', () => {
    expect(readThemeChoice(undefined)).toEqual({ choice: APP_THEME_CHOICE })
    expect(readThemeChoice(null)).toEqual({ choice: APP_THEME_CHOICE })
  })

  it('reads a named theme, ignoring case and surrounding space', () => {
    expect(readThemeChoice('light')).toEqual({ choice: { kind: 'light' } })
    expect(readThemeChoice(' Dark ')).toEqual({ choice: { kind: 'dark' } })
    expect(readThemeChoice('AUTO')).toEqual({ choice: APP_THEME_CHOICE })
  })

  it('keeps a theme object as written, so a pasted palette survives', () => {
    const custom = { name: 'Mine', type: 'dark', palette: ['#ffffff'], cssVar: { '--bgcolor': '#000000' } }
    expect(readThemeChoice(custom)).toEqual({ choice: { kind: 'custom', theme: custom } })
  })

  it('reports a value it cannot read instead of drawing something arbitrary', () => {
    for (const value of ['sepia', '', 3, true, ['dark']])
      expect(readThemeChoice(value)).toEqual({ error: expect.stringContaining('"theme"') })
  })
})

describe('mind map body theme — precedence against the app setting', () => {
  it('draws with the palette the body named, whatever the app theme is', () => {
    expect(resolveThemeChoice({ kind: 'light' }, true)).toEqual({ kind: 'light' })
    expect(resolveThemeChoice({ kind: 'dark' }, false)).toEqual({ kind: 'dark' })
  })

  it('follows the app theme when the body asks for nothing', () => {
    expect(resolveThemeChoice(APP_THEME_CHOICE, true)).toEqual({ kind: 'dark' })
    expect(resolveThemeChoice(APP_THEME_CHOICE, false)).toEqual({ kind: 'light' })
  })

  it('leaves a custom theme untouched, light app theme or dark', () => {
    const custom = { name: 'Mine' }
    expect(resolveThemeChoice({ kind: 'custom', theme: custom }, true)).toEqual({ kind: 'custom', theme: custom })
    expect(resolveThemeChoice({ kind: 'custom', theme: custom }, false)).toEqual({ kind: 'custom', theme: custom })
  })
})
