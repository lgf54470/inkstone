/**
 * Chart colours derived from the account's accent.
 *
 * A chart library's default palette is a rainbow chosen by nobody for the benefit of everybody, and
 * it sits badly against a page whose whole identity is one accent. So the series colours are built
 * from that accent instead: the first few series are the accent at different lightnesses, and later
 * ones lean to neighbouring hues only as far as they must to stay tellable apart.
 *
 * oklch is used because the tokens are written in it, because its lightness axis is perceptual (a
 * ladder of equal steps *looks* like equal steps, which hsl does not give), and because the browser
 * paints it directly — no conversion to sRGB and no gamut clipping to reason about.
 */

export interface Oklch {
  l: number
  c: number
  h: number
}

/** `oklch(49% 0.15 30)` and `oklch(0.49 0.15 30 / 0.6)` both appear in the token layer. */
const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+|%))?\s*\)$/i

export function parseOklch(color: string): Oklch | null {
  const match = OKLCH_RE.exec(color.trim())
  if (!match) return null
  const rawL = Number(match[1])
  const l = match[2] === '%' ? rawL / 100 : rawL
  return { l, c: Number(match[3]), h: Number(match[4]) }
}

export function formatOklch({ l, c, h }: Oklch): string {
  const round = (value: number, digits: number) => Number(value.toFixed(digits))
  return `oklch(${round(l * 100, 2)}% ${round(c, 4)} ${round(h, 2)})`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Where in the usable lightness band each successive series lands, as a fraction of that band. The
 * sequence is deliberately scattered rather than monotonic: neighbours in a legend get far-apart
 * lightness, and every value is distinct, so no two stops can collide however the band is placed.
 * The first is unused — series one *is* the accent.
 */
const LIGHTNESS_POSITIONS = [0, 0.62, 0.24, 0.84, 0.42, 0.06, 0.74, 0.30, 0.94, 0.14]

/**
 * How far each series leans off the accent's hue. The first two stay on it, so a one- or two-series
 * chart reads as the accent plain; the lean only grows as far as it must to keep later series apart.
 */
const HUE_LEAN = [0, 0, 22, -22, 44, 11, -33, 55, -11, 66]

/** The band a series colour may occupy, so nothing goes invisible against the page. */
const BAND = { light: [0.26, 0.88], dark: [0.48, 0.95] } as const

/**
 * A categorical palette anchored on `accent`: the first entry is the accent exactly, and the rest are
 * placed within a lightness band around it, leaning off its hue only as far as distinctness needs.
 *
 * `dark` picks the band, because a colour that separates cleanly on paper can sit inside the
 * background on a dark canvas.
 */
export function accentPalette(accent: Oklch, count: number, dark: boolean): string[] {
  const [floor, ceiling] = dark ? BAND.dark : BAND.light
  // The accent's own lightness anchors the band rather than being clamped into it, so a pale accent
  // and a deep one both keep their identity as the first series.
  const anchor = clamp(accent.l, floor, ceiling)
  return Array.from({ length: count }, (_, index) => {
    const position = index % LIGHTNESS_POSITIONS.length
    const cycle = Math.floor(index / LIGHTNESS_POSITIONS.length)
    const lean = HUE_LEAN[position]! + cycle * 180
    const l = position === 0 ? anchor : floor + (ceiling - floor) * LIGHTNESS_POSITIONS[position]!
    return formatOklch({
      l,
      // A dark canvas washes colour out, so the chroma is held up a little rather than copied flat.
      c: clamp(accent.c * (dark ? 1.06 : 1) * (1 - Math.abs(lean % 360) / 1400), 0.02, 0.37),
      h: ((accent.h + lean) % 360 + 360) % 360,
    })
  })
}

/**
 * The ramp a continuous scale (a heatmap's `visualMap`, a choropleth) interpolates between: near the
 * surface colour at the low end, the accent at full strength at the high end. Three stops rather than
 * two so the middle of the range does not go muddy.
 */
export function accentRamp(accent: Oklch, dark: boolean): string[] {
  return dark
    ? [formatOklch({ l: 0.24, c: accent.c * 0.12, h: accent.h }), formatOklch({ l: 0.44, c: accent.c * 0.7, h: accent.h }), formatOklch({ l: 0.72, c: accent.c, h: accent.h })]
    : [formatOklch({ l: 0.96, c: accent.c * 0.12, h: accent.h }), formatOklch({ l: 0.72, c: accent.c * 0.62, h: accent.h }), formatOklch({ l: accent.l, c: accent.c, h: accent.h })]
}

/** How many series a palette is generated for. echarts cycles past the end; ten covers a real chart. */
export const PALETTE_SIZE = 10
