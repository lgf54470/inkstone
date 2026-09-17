import { describe, expect, it } from 'vitest'
import { pathDataIsDrawable, pathViewBox } from './shape-path'
import type { ShapeElement } from './types'

function shape(over: Partial<ShapeElement> = {}): ShapeElement {
  return { id: 's1', type: 'shape', shape: 'path', fill: 'none', x: 0, y: 0, w: 200, h: 100, ...over }
}

describe('pathDataIsDrawable', () => {
  it('accepts the commands and numbers a real path is written with', () => {
    expect(pathDataIsDrawable('M 0 40 C 20 0, 60 0, 80 40')).toBe(true)
    expect(pathDataIsDrawable('m10,10l20,20z')).toBe(true)
    expect(pathDataIsDrawable('M0 0 A 5 5 0 0 1 10 10')).toBe(true)
  })

  it('refuses anything that is not geometry, and a path with no moveto', () => {
    expect(pathDataIsDrawable('')).toBe(false)
    expect(pathDataIsDrawable(undefined)).toBe(false)
    expect(pathDataIsDrawable('L 10 10')).toBe(false)
    expect(pathDataIsDrawable('M 0 0" onload="alert(1)')).toBe(false)
    expect(pathDataIsDrawable('M 0 0 <script>')).toBe(false)
    expect(pathDataIsDrawable('M 0 0 url(#x)')).toBe(false)
  })
})

describe('pathViewBox', () => {
  it('uses the box the path was authored in', () => {
    expect(pathViewBox(shape({ pathBox: { x: 0, y: 0, w: 80, h: 40 } }))).toBe('0 0 80 40')
    expect(pathViewBox(shape({ pathBox: { x: 10, y: 5, w: 80, h: 40 } }))).toBe('10 5 80 40')
  })

  it('falls back to the unit box for a missing or degenerate one', () => {
    expect(pathViewBox(shape({}))).toBe('0 0 100 100')
    expect(pathViewBox(shape({ pathBox: { w: 0, h: 40 } }))).toBe('0 0 100 100')
    expect(pathViewBox(shape({ pathBox: { w: 80 } }))).toBe('0 0 100 100')
  })
})
