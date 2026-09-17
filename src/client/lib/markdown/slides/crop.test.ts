import { describe, expect, it } from 'vitest'
import { CROP_MAX_SCALE, cropImageStyle, isIdentityCrop, normalizeCrop } from './crop'

describe('normalizeCrop', () => {
  it('keeps values in range and fills in the middle for what is missing', () => {
    expect(normalizeCrop({ x: 0, y: 1, scale: 2 })).toEqual({ x: 0, y: 1, scale: 2 })
    expect(normalizeCrop({})).toEqual({ x: 0.5, y: 0.5, scale: 1 })
    expect(normalizeCrop(undefined)).toBeNull()
  })

  it('clamps out-of-range numbers and a nonsense scale instead of dropping them', () => {
    expect(normalizeCrop({ x: 1.2, y: -0.4, scale: 0.2 })).toEqual({ x: 1, y: 0, scale: 1 })
    expect(normalizeCrop({ x: Number.NaN, y: 0.25, scale: 99 })).toEqual({
      x: 0.5,
      y: 0.25,
      scale: CROP_MAX_SCALE,
    })
  })
})

describe('isIdentityCrop', () => {
  it('calls the centred 1x crop the same picture as no crop', () => {
    expect(isIdentityCrop(undefined)).toBe(true)
    expect(isIdentityCrop({ x: 0.5, y: 0.5, scale: 1 })).toBe(true)
    expect(isIdentityCrop({ x: 0.5, y: 0.5, scale: 1.5 })).toBe(false)
    expect(isIdentityCrop({ x: 0, y: 0.5, scale: 1 })).toBe(false)
  })
})

describe('cropImageStyle', () => {
  it('enlarges the picture inside the frame and aligns the edge the crop names', () => {
    const style = cropImageStyle({ x: 0.5, y: 0, scale: 2 })
    expect(style.width).toBe('200%')
    expect(style.height).toBe('200%')
    expect(style.left).toBe('-50%')
    expect(style.top).toBe('0%')
    expect(style.objectFit).toBe('cover')
    expect(style.objectPosition).toBe('50% 0%')
  })

  it('moves nothing at 1x, and never lets the picture shrink below the frame', () => {
    const style = cropImageStyle({ x: 1, y: 1, scale: 1 })
    expect(style.left).toBe('0%')
    expect(style.top).toBe('0%')
    expect(style.width).toBe('100%')
  })
})
