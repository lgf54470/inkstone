/**
 * The site's accent, read for the things that draw outside CSS.
 *
 * The oklch arithmetic lives in ./palette; this is the half that touches the document, kept apart so
 * the math stays testable without a DOM. Every call re-reads: a chart's colours must follow the accent
 * the page carries now rather than the one that happened to be set when this module was first loaded
 * (ADR-0002 §5), which is also why a reader who flips the reading theme gets a repainted chart.
 */
import { token } from './token.ts'
import { PALETTE_SIZE, accentPalette, accentRamp, parseOklch, type Oklch } from './palette.ts'

/** cinnabar, the accent the token layer ships with. Only reached with no stylesheet in reach. */
const FALLBACK_ACCENT: Oklch = { l: 0.49, c: 0.15, h: 30 }

export function chartAccent(): Oklch {
  return parseOklch(token('--accent', '')) ?? FALLBACK_ACCENT
}

export function chartPalette(dark: boolean): string[] {
  return accentPalette(chartAccent(), PALETTE_SIZE, dark)
}

export function chartRamp(dark: boolean): string[] {
  return accentRamp(chartAccent(), dark)
}

/**
 * What the colours a chart would draw with depend on, short enough to live in a cache key. A reader
 * cannot switch the accent, but the site can be redeployed with another one and the reading theme
 * flips the ramp's lightness band, so a key carrying only the light mode would let a drawn chart keep
 * colours it read before either moved.
 */
export function chartPaletteKey(dark: boolean): string {
  return `${dark ? 'd' : 'l'}:${token('--accent', '')}`
}
