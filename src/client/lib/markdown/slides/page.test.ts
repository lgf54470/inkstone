import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, fitPageScale } from './page'

describe('the default page', () => {
  it('is the format 16:9 frame', () => {
    expect(DEFAULT_PAGE_SIZE).toEqual({ width: 1280, height: 720 })
  })
})

describe('fitPageScale', () => {
  it('fits a 4:3 page into a tall box by width, without stretching it', () => {
    expect(fitPageScale({ width: 1024, height: 768 }, { width: 1000, height: 1200 })).toBeCloseTo(
      1000 / 1024,
    )
  })

  it('fits a 16:9 page into a projector screen at its own scale', () => {
    expect(fitPageScale({ width: 1920, height: 1080 }, { width: 1920, height: 2000 })).toBe(1)
  })
})
