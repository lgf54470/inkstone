import { describe, expect, it } from 'vitest'
import { EXPORT_CSS } from './export-note'
import { EXPORT_PALETTE } from './export-palette'

// Both directions of the export palette contract: every color the rendered
// export CSS contains must come from EXPORT_PALETTE (a raw hex dropped into
// the template would surface here as an unknown value), and every palette
// entry must be used (an orphaned entry means the stylesheet drifted from
// the table of record).
describe('export palette', () => {
  it('renders EXPORT_CSS only through EXPORT_PALETTE values', () => {
    const rendered = EXPORT_CSS
    const hexes = rendered.match(/#[0-9a-f]{3,8}\b/gi) ?? []
    const rgba = rendered.match(/rgba\([0-9., ]+\)/g) ?? []
    const used = new Set([...hexes, ...rgba])
    const paletteValues = new Set(Object.values(EXPORT_PALETTE))

    expect([...used].sort()).toEqual([...paletteValues].sort())
  })
})