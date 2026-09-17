import type { ShapeElement } from './types'

/**
 * The characters an SVG path may be written with: path commands, digits and the separators
 * between them. A `d` that carries anything else is not geometry — and since a deck's body is
 * untrusted input, a value that is not geometry must not reach an attribute a browser parses
 * as one. Requiring a moveto as well is what keeps a lone number from drawing nothing at all
 * with no way to notice.
 */
const PATH_DATA = /^[\s0-9MmZzLlHhVvCcSsQqTtAaEe+.,-]+$/

export function pathDataIsDrawable(d?: string): boolean {
  const value = (d ?? '').trim()
  if (value.length < 4) return false
  if (!PATH_DATA.test(value)) return false
  return /[Mm]/.test(value)
}

/**
 * The coordinate space a path is written in. A path shape carries its own `pathBox`, because
 * its geometry is not a 0..100 square the way the built-in shapes are; without one the
 * conventional unit box is the only honest guess.
 */
export function pathViewBox(el: ShapeElement): string {
  const box = el.pathBox
  const numbers = [box?.x ?? 0, box?.y ?? 0, box?.w ?? 0, box?.h ?? 0]
  if (!numbers.every((n) => Number.isFinite(n)) || numbers[2] <= 0 || numbers[3] <= 0) {
    return '0 0 100 100'
  }
  return numbers.join(' ')
}
