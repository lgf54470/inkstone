import { describe, expect, it } from 'vitest'
import { clampPosition, keyboardPosition } from './music-drag'

const VIEWPORT = { width: 1000, height: 800 }
const SIZE = { width: 288, height: 220 }

describe('clampPosition', () => {
  it('keeps the widget inside the viewport with an edge margin', () => {
    expect(clampPosition({ x: -40, y: -40 }, SIZE, VIEWPORT)).toEqual({ x: 8, y: 8 })
    expect(clampPosition({ x: 5000, y: 5000 }, SIZE, VIEWPORT)).toEqual({ x: 1000 - 288 - 8, y: 800 - 220 - 8 })
  })

  it('pins to the margin when the widget is larger than the viewport', () => {
    expect(clampPosition({ x: 50, y: 50 }, { width: 1200, height: 900 }, VIEWPORT)).toEqual({ x: 8, y: 8 })
  })

  it('leaves an inside position untouched', () => {
    expect(clampPosition({ x: 320, y: 240 }, SIZE, VIEWPORT)).toEqual({ x: 320, y: 240 })
  })
})

describe('keyboardPosition', () => {
  it('moves by a fixed step for the arrow keys', () => {
    expect(keyboardPosition({ x: 320, y: 240 }, 'ArrowLeft', SIZE, VIEWPORT)).toEqual({ x: 304, y: 240 })
    expect(keyboardPosition({ x: 320, y: 240 }, 'ArrowDown', SIZE, VIEWPORT)).toEqual({ x: 320, y: 256 })
    expect(keyboardPosition({ x: 320, y: 240 }, 'ArrowRight', SIZE, VIEWPORT)).toEqual({ x: 336, y: 240 })
  })

  it('clamps the keyboard step and ignores other keys', () => {
    expect(keyboardPosition({ x: 300, y: 10 }, 'ArrowUp', SIZE, VIEWPORT)).toEqual({ x: 300, y: 8 })
    expect(keyboardPosition({ x: 300, y: 300 }, 'Enter', SIZE, VIEWPORT)).toBeNull()
  })
})
