import { describe, expect, it } from 'vitest'
import { APP_THEME_CHOICE, fenceThemeChoice, readFenceAnnotation, readThemeChoice, resolveThemeChoice, withFenceAnnotation } from './theme'

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

describe('mind map fence annotation — the same statement, beside the language', () => {
  it('reads the value out of the info string however it is written', () => {
    expect(readFenceAnnotation('mindmap theme=dark')).toBe('dark')
    expect(readFenceAnnotation('mindmap title="a b" theme=" light "')).toBe(' light ')
    expect(readFenceAnnotation("mindmap theme='auto'")).toBe('auto')
    expect(readFenceAnnotation('mindmap')).toBeNull()
    expect(readFenceAnnotation('mindmap THEME=Dark')).toBe('Dark')
  })

  it('leaves every other part of the line alone when it rewrites the annotation', () => {
    expect(withFenceAnnotation('mindmap', 'dark')).toBe('mindmap theme=dark')
    expect(withFenceAnnotation('mindmap theme=dark', 'light')).toBe('mindmap theme=light')
    expect(withFenceAnnotation('mindmap theme=dark title="Roadmap"', null)).toBe('mindmap title="Roadmap"')
    expect(withFenceAnnotation('mindmap', null)).toBe('mindmap')
  })

  it('does not mistake a word that merely starts with the key', () => {
    expect(readFenceAnnotation('mindmap themes=x')).toBeNull()
    expect(withFenceAnnotation('mindmap themes=x', 'dark')).toBe('mindmap themes=x theme=dark')
  })
})

describe('mind map fence annotation — how it meets the body’s own field', () => {
  it('falls back to the annotation when the body names nothing', () => {
    expect(fenceThemeChoice(APP_THEME_CHOICE, 'dark')).toEqual({ choice: { kind: 'dark' } })
  })

  it('keeps what the body named, annotation or not', () => {
    expect(fenceThemeChoice({ kind: 'light' }, 'dark')).toEqual({ choice: { kind: 'light' } })
    const custom = { kind: 'custom' as const, theme: { name: 'Mine' } }
    expect(fenceThemeChoice(custom, 'dark')).toEqual({ choice: custom })
  })

  it('says nothing when neither names a palette', () => {
    expect(fenceThemeChoice(APP_THEME_CHOICE, null)).toEqual({ choice: APP_THEME_CHOICE })
  })

  it('reports an annotation it cannot read, even when the body named one', () => {
    expect(fenceThemeChoice(APP_THEME_CHOICE, 'sepia')).toEqual({ error: expect.stringContaining('"theme"') })
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
