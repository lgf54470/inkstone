import type { CSSProperties } from 'react'

/**
 * The colours a code element's tokens are painted with. A deck may name any of them in
 * `theme.codePalette`; the values here are what a deck that names none is drawn with, and
 * the palette inspector edits the same table rather than keeping a second copy of it.
 *
 * The keys are single letters because the palette is written into the fence body, where a
 * slide's code colours travel next to everything else a reader might hand-edit.
 */
export const CODE_PALETTE_KEYS = ['c', 's', 'n', 'k', 'f', 'p'] as const

export type CodePaletteKey = (typeof CODE_PALETTE_KEYS)[number]

export const CODE_PALETTE_DEFAULTS: Record<CodePaletteKey, string> = {
  c: '#6B7F8F',
  s: '#C98A3E',
  n: '#B0688F',
  k: '#5B8DEF',
  f: '#3FA9A0',
  p: '#7C8794',
}

/**
 * The palette as custom properties on the element that holds the highlighted markup: the
 * colours are per-deck and change while the reader drags a colour input, which is exactly
 * what a CSS variable is for. The stylesheet names them once for every surface that draws
 * code, so the canvas, a thumbnail and a printed page cannot drift apart.
 */
export function codePaletteVars(palette?: Record<string, string>): CSSProperties {
  const vars: Record<string, string> = {}
  for (const key of CODE_PALETTE_KEYS) {
    vars[`--bento-code-${key}`] = palette?.[key] || CODE_PALETTE_DEFAULTS[key]
  }
  return vars as CSSProperties
}
