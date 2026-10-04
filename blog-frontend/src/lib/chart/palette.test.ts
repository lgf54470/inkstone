import { describe, expect, it } from 'vitest'
import { PALETTE_SIZE, accentPalette, accentRamp, formatOklch, parseOklch } from './palette'

const ACCENT = { l: 0.49, c: 0.15, h: 30 }

describe('reading the accent token', () => {
  it('takes both spellings the token layer uses', () => {
    expect(parseOklch('oklch(49% 0.15 30)')).toEqual(ACCENT)
    expect(parseOklch('oklch(0.49 0.15 30)')).toEqual(ACCENT)
    expect(parseOklch('  oklch(49% 0.15 -120)  ')).toEqual({ l: 0.49, c: 0.15, h: -120 })
  })

  it('refuses anything that is not an oklch colour', () => {
    for (const raw of ['', '#fff', 'rgb(1,2,3)', 'oklab(0.5 0.1 0.1)', 'hsl(30 50% 50%)']) {
      expect(parseOklch(raw), raw).toBeNull()
    }
  })

  it('writes back something it can read again', () => {
    for (const oklch of [ACCENT, { l: 1, c: 0, h: 0 }, { l: 0.2, c: 0.37, h: 359.9 }]) {
      expect(parseOklch(formatOklch(oklch))).toEqual(oklch)
    }
  })
})

describe('the categorical ramp', () => {
  it('starts on the accent itself and yields the asked-for count', () => {
    const light = accentPalette(ACCENT, PALETTE_SIZE, false)
    expect(light).toHaveLength(PALETTE_SIZE)
    expect(light[0]).toBe(formatOklch(ACCENT))
  })

  // Past one cycle the ramp repeats by design — a chart with 40 series is not what this is for.
  it('stays inside a paintable range and keeps one cycle of stops distinct', () => {
    for (const dark of [false, true]) {
      const palette = accentPalette(ACCENT, PALETTE_SIZE, dark)
      const parsed = palette.map((entry) => parseOklch(entry))
      expect(parsed.every(Boolean)).toBe(true)
      for (const stop of parsed) {
        expect(stop!.l).toBeGreaterThanOrEqual(dark ? 0.42 : 0.24)
        expect(stop!.l).toBeLessThanOrEqual(dark ? 0.94 : 0.86)
        expect(stop!.c).toBeGreaterThanOrEqual(0.02)
      }
      expect(new Set(palette).size).toBe(palette.length)
    }
  })
})

describe('where the ramp leaves the accent', () => {
  it('mirrors the lightness ladder for a dark canvas', () => {
    const light = accentPalette(ACCENT, 4, false).map((entry) => parseOklch(entry)!.l)
    const dark = accentPalette(ACCENT, 4, true).map((entry) => parseOklch(entry)!.l)
    // Series 2 leans darker on paper and lighter on a dark canvas, so the same index moves the other
    // way; series 1 is the accent in both, which is the point of anchoring on it.
    expect(dark[0]).toBeCloseTo(light[0], 5)
    expect(dark[1]! - light[1]!).toBeGreaterThan(0)
  })

  it('holds the accent for the first two series and only then leans', () => {
    const palette = accentPalette(ACCENT, 6, false).map((entry) => parseOklch(entry)!)
    expect(palette[0]!.h).toBe(ACCENT.h)
    expect(palette[1]!.h).toBe(ACCENT.h)
    expect(palette[2]!.h).not.toBe(ACCENT.h)
  })

  it('anchors the first series on the accent whatever its lightness', () => {
    for (const l of [0.2, 0.49, 0.9]) {
      const first = parseOklch(accentPalette({ ...ACCENT, l }, 3, false)[0]!)!
      expect(first.h).toBe(ACCENT.h)
      expect(first.l).toBeCloseTo(Math.min(0.88, Math.max(0.26, l)), 5)
    }
  })

  it('keeps a grey accent grey rather than inventing chroma', () => {
    const graphite = { l: 0.5, c: 0.01, h: 265 }
    for (const entry of accentPalette(graphite, 5, false)) {
      expect(parseOklch(entry)!.c).toBeLessThan(0.05)
    }
  })
})

describe('the continuous ramp', () => {
  it('runs light-to-accent on paper and dark-to-bright on a dark canvas', () => {
    const light = accentRamp(ACCENT, false).map((entry) => parseOklch(entry)!.l)
    expect(light).toHaveLength(3)
    expect(light[0]!).toBeGreaterThan(light[1]!)
    expect(light[1]!).toBeGreaterThan(light[2]!)
    expect(light[2]).toBe(ACCENT.l)
    const dark = accentRamp(ACCENT, true).map((entry) => parseOklch(entry)!.l)
    expect(dark[0]!).toBeLessThan(dark[1]!)
    expect(dark[1]!).toBeLessThan(dark[2]!)
  })

  it('keeps the ramp in the accent hue family', () => {
    for (const entry of accentRamp(ACCENT, false)) {
      expect(parseOklch(entry)!.h).toBe(ACCENT.h)
    }
  })
})
