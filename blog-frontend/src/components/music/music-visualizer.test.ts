import { describe, expect, it } from 'vitest'
import { visualizerLevels } from './music-visualizer'

function spectrum(values: number[]): Uint8Array {
  const bytes = new Uint8Array(64)
  values.forEach((value, index) => {
    bytes[index] = value
  })
  return bytes
}

describe('visualizerLevels', () => {
  it('returns one peak per bar from the usable part of the spectrum', () => {
    const levels = visualizerLevels(spectrum([255, 0, 128, 0, 64, 0, 32, 0]), 4)
    expect(levels).toHaveLength(4)
    expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true)
    expect(Math.max(...levels)).toBe(1)
  })

  it('grows with louder frequencies and stays flat for silence', () => {
    expect(visualizerLevels(spectrum([]), 5)).toEqual([0, 0, 0, 0, 0])
    const quiet = visualizerLevels(spectrum([40, 40, 40, 40]), 4)
    const loud = visualizerLevels(spectrum([220, 220, 220, 220]), 4)
    expect(Math.max(...loud)).toBeGreaterThan(Math.max(...quiet))
  })

  it('keeps the first bars inside the spectrum when it is shorter than the bar count', () => {
    const levels = visualizerLevels(new Uint8Array(3).fill(200), 12)
    expect(levels).toHaveLength(12)
    expect(levels.every((level) => Number.isFinite(level))).toBe(true)
  })
})
