/**
 * The account's accent, read for the things that draw outside CSS.
 *
 * The pure oklch math lives in ./palette; this is the half that touches the document, kept apart so
 * the math stays testable without a DOM and so both drawing backends ask one question the same way.
 * Every call re-reads: a chart's colours must follow the accent the account has now, not the one that
 * happened to be set when the module was first loaded (ADR-0002 §5).
 */
import { token } from '../style-token'
import { PALETTE_SIZE, accentPalette, accentRamp, parseOklch, type Oklch } from './palette'

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
 * What the colours a chart would draw with currently depend on, in a string short enough to live in a
 * cache key. The accent is switchable per account and the ramp leans on the light mode, so a key that
 * carried only the light mode would let a chart keep colours it read before the accent moved.
 */
export function chartPaletteKey(dark: boolean): string {
  return `${dark ? 'd' : 'l'}:${token('--accent', '')}`
}
