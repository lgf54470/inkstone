import { describe, expect, it } from 'vitest'
import { CODE_PALETTE_DEFAULTS, CODE_PALETTE_KEYS, codePaletteVars } from './code-palette'

describe('the code palette', () => {
  it('names a default for every token kind a deck can colour', () => {
    for (const key of CODE_PALETTE_KEYS) {
      expect(CODE_PALETTE_DEFAULTS[key]).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('hands the palette to the stylesheet as custom properties', () => {
    const vars = codePaletteVars({ c: '#112233' }) as Record<string, string>
    expect(vars['--bento-code-c']).toBe('#112233')
    expect(vars['--bento-code-k']).toBe(CODE_PALETTE_DEFAULTS.k)
  })

  it('falls back to the defaults for a deck that names no palette', () => {
    const vars = codePaletteVars() as Record<string, string>
    expect(vars['--bento-code-s']).toBe(CODE_PALETTE_DEFAULTS.s)
  })
})
