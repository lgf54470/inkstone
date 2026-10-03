import { describe, expect, it } from 'vitest'
import {
  EXAMPLE_SPLIT_DEFAULTS,
  exampleRatioLabel,
  exampleSplitTracks,
  isVerticalExampleLayout,
  parseExampleRatio,
  parseExampleSplit,
} from './split'

describe('parseExampleRatio', () => {
  it('reads a:b parts and rejects out-of-range or malformed values', () => {
    expect(parseExampleRatio('3:7')).toEqual([3, 7])
    expect(parseExampleRatio(' 2 : 8 ')).toEqual([2, 8])
    expect(parseExampleRatio('0:5')).toBeNull()
    expect(parseExampleRatio('100:5')).toBeNull()
    expect(parseExampleRatio('3-7')).toBeNull()
  })

  it('exposes label, tracks and orientation helpers', () => {
    expect(exampleRatioLabel([3, 7])).toBe('3:7')
    expect(exampleSplitTracks([3, 7])).toBe('3fr 7fr')
    expect(isVerticalExampleLayout('tb')).toBe(true)
    expect(isVerticalExampleLayout('lr')).toBe(false)
  })
})

describe('parseExampleSplit', () => {
  it('keeps the family default without options', () => {
    expect(parseExampleSplit('title="x"', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual(EXAMPLE_SPLIT_DEFAULTS.md)
    expect(parseExampleSplit('', EXAMPLE_SPLIT_DEFAULTS.js)).toEqual(EXAMPLE_SPLIT_DEFAULTS.js)
  })

  it('resolves layout aliases and quoted ratios', () => {
    expect(parseExampleSplit('layout=rl ratio="3:7"', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual({
      layout: 'rl',
      ratio: [3, 7],
    })
    expect(parseExampleSplit('layout=vertical ratio=8:2', EXAMPLE_SPLIT_DEFAULTS.js).layout).toBe('tb')
    expect(parseExampleSplit('direction=bottom-top', EXAMPLE_SPLIT_DEFAULTS.md).layout).toBe('bt')
  })

  it('ignores invalid layouts and ratios without guessing', () => {
    const parsed = parseExampleSplit('layout=diagonal ratio="100:100"', EXAMPLE_SPLIT_DEFAULTS.md)
    expect(parsed.layout).toBe('lr')
    expect(parsed.ratio).toEqual([45, 55])
  })
})
