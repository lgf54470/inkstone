import { lift, parse } from 'zrender/lib/tool/color.js'
import { describe, expect, it } from 'vitest'
import { PALETTE_SIZE, accentPalette, accentRamp, parseOklch, toRgb, type Oklch } from './palette'

/**
 * The palette is arithmetic on the accent, and two of its properties are the reason it exists: the
 * library that draws the chart has to be able to *read* the colours back, and a legend has to be able to
 * tell the entries apart. Both are asserted here rather than looked at.
 */

const ACCENT = { l: 0.49, c: 0.15, h: 30 }
const GRAPHITE = { l: 0.38, c: 0.03, h: 250 }

function hexToRgb(hex: string): number[] {
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16) / 255
  return [channel(1), channel(3), channel(5)]
}

/** The reference inverse: linear first, then the cube roots, then the lab matrix — in that order. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function rgbToOklch([r, g, b]: number[]): Oklch {
  const [x, y, z] = [toLinear(r), toLinear(g), toLinear(b)]
  const l_ = Math.cbrt(0.4122214708 * x + 0.5363325363 * y + 0.0514453873 * z)
  const m_ = Math.cbrt(0.2119034982 * x + 0.6806995451 * y + 0.1073969566 * z)
  const s_ = Math.cbrt(0.0883024619 * x + 0.2817188376 * y + 0.6299787005 * z)
  const light = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757870 * s_
  let hue = (Math.atan2(b2, a) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { l: light, c: Math.hypot(a, b2), h: hue }
}

function hueApart(a: number, b: number): number {
  const apart = Math.abs(((a - b) % 360) + 360) % 360
  return Math.min(apart, 360 - apart)
}

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
})

describe('painting an oklch colour as sRGB', () => {
  it('reproduces the colours the reference groups are written in', () => {
    // #627486 is a slate of the same family as the graphite accent; the conversion is what has to be
    // right, so it is checked against the hex it must land on rather than against itself.
    expect(toRgb({ l: 0.551, c: 0.035, h: 248 })).toBe('#627486')
    expect(toRgb({ l: 0.395, c: 0.03, h: 249 })).toBe('#3a4856')
  })

  it('keeps the hue when it has to give up chroma to fit', () => {
    const beyond = { l: 0.72, c: 0.34, h: 145 }
    const back = rgbToOklch(hexToRgb(toRgb(beyond)))
    expect(hueApart(back.h, beyond.h)).toBeLessThan(8)
    expect(back.c).toBeLessThan(beyond.c)
  })

  it('answers with something both the browser and the chart library can read', () => {
    for (const color of [ACCENT, GRAPHITE, { l: 0, c: 0, h: 0 }, { l: 1, c: 0.4, h: 359 }, { l: 0.5, c: 0.02, h: -80 }]) {
      const hex = toRgb(color)
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(parse(hex), hex).toHaveLength(4)
    }
  })
})

describe('the categorical group', () => {
  it('starts on the accent itself and yields the asked-for count', () => {
    const light = accentPalette(ACCENT, PALETTE_SIZE, false)
    expect(light).toHaveLength(PALETTE_SIZE)
    expect(light[0]).toBe(toRgb(ACCENT))
  })

  // This is the whole reason the palette is hex: zrender parses a colour whenever it has to derive one
  // — a hover state, a sankey link from its node, a visualMap range — and an oklch string parses to
  // nothing, which drew a heatmap as a black box and made a bar vanish under the pointer.
  it('hands the library colours it can parse and can therefore lift for a hover state', () => {
    for (const dark of [false, true]) {
      for (const entry of accentPalette(ACCENT, PALETTE_SIZE, dark)) {
        expect(parse(entry), entry).toHaveLength(4)
        expect(lift(entry, 0.2), entry).toMatch(/^rgba\(/)
      }
    }
  })

  it('keeps one cycle of stops distinct, and one hue family apart by lightness', () => {
    for (const dark of [false, true]) {
      const palette = accentPalette(ACCENT, PALETTE_SIZE, dark)
      expect(new Set(palette).size).toBe(palette.length)
      const stops = palette.map((entry) => rgbToOklch(hexToRgb(entry)))
      // Every pair of same-hue series, and the smallest lightness gap among them: series one is the
      // accent, so it is measured against but never moved.
      const gaps = stops.flatMap((stop, index) => stops.slice(0, index)
        .filter((earlier) => hueApart(earlier.h, stop.h) <= 30)
        .map((earlier) => Math.abs(earlier.l - stop.l)))
      expect(Math.min(...gaps), palette.join(' ')).toBeGreaterThanOrEqual(0.075)
    }
  })

  it('stays inside the band that keeps a series visible on the page it is drawn on', () => {
    for (const dark of [false, true]) {
      const [floor, ceiling] = dark ? [0.55, 0.9] : [0.36, 0.8]
      const stops = accentPalette(GRAPHITE, PALETTE_SIZE, dark).map((entry) => rgbToOklch(hexToRgb(entry)))
      for (const stop of stops.slice(1)) {
        expect(stop.l).toBeGreaterThanOrEqual(floor - 0.01)
        expect(stop.l).toBeLessThanOrEqual(ceiling + 0.01)
      }
      // Series one is the accent at its own lightness, not a band position.
      expect(stops[0]!.l).toBeCloseTo(dark ? 0.55 : GRAPHITE.l, 2)
    }
  })

  it('puts the accent hue first and the complement in as the spot', () => {
    const stops = accentPalette(GRAPHITE, 6, false).map((entry) => rgbToOklch(hexToRgb(entry)))
    expect(hueApart(stops[0]!.h, GRAPHITE.h)).toBeLessThan(5)
    expect(hueApart(stops[1]!.h, GRAPHITE.h)).toBeLessThan(2)
    expect(hueApart(stops[2]!.h, GRAPHITE.h + 174)).toBeLessThan(6)
    // A grey accent still gets one saturated contrast, which is what makes the group read as designed
    // rather than as one colour printed five times.
    expect(stops[2]!.c).toBeGreaterThan(0.1)
    expect(stops[0]!.c).toBeLessThan(0.05)
  })

  it('moves with the accent rather than around it', () => {
    for (const accent of [ACCENT, GRAPHITE, { l: 0.7, c: 0.12, h: 200 }]) {
      for (const dark of [false, true]) {
        const first = rgbToOklch(hexToRgb(accentPalette(accent, 4, dark)[0]!))
        const [floor, ceiling] = dark ? [0.55, 0.9] : [0.36, 0.8]
        expect(first.l).toBeCloseTo(Math.min(Math.max(accent.l, floor), ceiling), 2)
        expect(hueApart(first.h, accent.h)).toBeLessThan(4)
      }
    }
  })
})

describe('the continuous ramp', () => {
  it('runs light-to-accent on paper and dark-to-bright on a dark canvas', () => {
    const light = accentRamp(ACCENT, false).map((entry) => rgbToOklch(hexToRgb(entry)).l)
    const dark = accentRamp(ACCENT, true).map((entry) => rgbToOklch(hexToRgb(entry)).l)
    expect(light[0]).toBeGreaterThan(light[1]!)
    expect(light[1]).toBeGreaterThan(light[2]!)
    expect(dark[0]).toBeLessThan(dark[1]!)
    expect(dark[1]).toBeLessThan(dark[2]!)
  })

  it('keeps the ramp in the accent hue family and parseable by the interpolator', () => {
    for (const dark of [false, true]) {
      const ramp = accentRamp(GRAPHITE, dark)
      expect(ramp).toHaveLength(3)
      for (const entry of ramp) {
        expect(parse(entry), entry).toBeTruthy()
        const stop = rgbToOklch(hexToRgb(entry))
        // A near-grey has no hue to be near, so only the chromatic end of the ramp is held to the family.
        if (stop.c > 0.02) expect(hueApart(stop.h, GRAPHITE.h), entry).toBeLessThan(12)
      }
    }
  })
})
