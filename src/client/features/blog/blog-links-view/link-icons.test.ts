import { describe, expect, it } from 'vitest'
import { LUCIDE_LINK_ICON_NAMES, PRESET_LINK_ICON_NAMES, lucideSlugOf } from './link-icons'

/**
 * A stored icon is a lucide export name (`FileText`) while the per-icon loader is keyed by the name
 * the library's files use (`file-text`); a value that resolves to neither is drawn as the letter
 * avatar, so a mapping that quietly stopped matching would show up as avatars everywhere rather than
 * as a failure.
 */
describe('link icon names', () => {
  it('resolves a stored export name to the key that loads that icon', () => {
    expect(lucideSlugOf('Globe')).toBe('globe')
    expect(lucideSlugOf('FileText')).toBe('file-text')
    expect(lucideSlugOf('Gamepad2')).toBe('gamepad-2')
    expect(lucideSlugOf('ALargeSmall')).toBe('a-large-small')
    expect(lucideSlugOf('AArrowDown')).toBe('a-arrow-down')
  })

  it('reports anything else as unresolvable instead of guessing a slug', () => {
    expect(lucideSlugOf('NotAnIcon')).toBeNull()
    expect(lucideSlugOf('globe')).toBeNull()
    expect(lucideSlugOf('')).toBeNull()
  })

  it('resolves every preset, so no preset cell can render blank', () => {
    const unresolved = PRESET_LINK_ICON_NAMES.filter((name) => lucideSlugOf(name) === null)
    expect(unresolved).toEqual([])
  })

  it('offers each searchable name once, in a stable order', () => {
    expect(LUCIDE_LINK_ICON_NAMES.length).toBeGreaterThan(1500)
    expect(new Set(LUCIDE_LINK_ICON_NAMES).size).toBe(LUCIDE_LINK_ICON_NAMES.length)
    expect([...LUCIDE_LINK_ICON_NAMES].sort()).toEqual([...LUCIDE_LINK_ICON_NAMES])
  })
})
