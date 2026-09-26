import { describe, expect, it } from 'vitest'
import { coverGradientFromPixels } from './music-cover-colors'

describe('cover color sampling (FEA-C2)', () => {
  it('builds a two-stop gradient from the pixel average and its darkened pair', () => {
    // 4 pixels: two warm, one bright, one dark — the average is a mid warm grey.
    const data = new Uint8ClampedArray([
      200, 120, 60, 255,
      210, 130, 70, 255,
      240, 240, 240, 255,
      20, 20, 30, 255,
    ])
    const gradient = coverGradientFromPixels(data)
    if (!gradient) throw new Error('the gradient should have been built')
    expect(gradient).toMatch(/^linear-gradient\(135deg, rgb\(\d+, \d+, \d+\), rgb\(\d+, \d+, \d+\)\)$/)
    const stops = gradient.match(/rgb\((\d+), (\d+), (\d+)\)/g) ?? []
    expect(stops).toHaveLength(2)
  })

  it('returns null for an empty pixel buffer', () => {
    expect(coverGradientFromPixels(new Uint8ClampedArray(0))).toBeNull()
  })
})
