import { describe, expect, it } from 'vitest'
import { EQ_BAND_COUNT, EQ_BANDS, EQ_GAIN_RANGE_DB, emptyEqBands, eqBandLabel, readEqBands, readEqDb } from './music-eq-bands'

// The table is the one thing the graph, the presets and the sliders all trust, so its shape is pinned
// here rather than only through its consumers: a missing band would leave a hole in the spectrum and a
// duplicate centre would make two sliders fight over the same frequencies.
describe('the ten band table', () => {
  it('spans ten octave centres in ascending order', () => {
    const frequencies = EQ_BANDS.map((band) => band.frequencyHz)
    expect(EQ_BAND_COUNT).toBe(10)
    expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b))
    expect(new Set(frequencies).size).toBe(frequencies.length)
  })

  it('shapes the ends with shelves and the middle with one-octave peaks', () => {
    expect(EQ_BANDS[0]?.type).toBe('lowshelf')
    expect(EQ_BANDS[EQ_BAND_COUNT - 1]?.type).toBe('highshelf')
    const peaks = EQ_BANDS.slice(1, -1)
    expect(peaks.every((band) => band.type === 'peaking')).toBe(true)
    expect(new Set(peaks.map((band) => band.q))).toEqual(new Set([1.41]))
  })

  it('starts every band flat and names each by its centre frequency', () => {
    expect(emptyEqBands()).toEqual(EQ_BANDS.map(() => 0))
    expect(eqBandLabel(0)).toBe('31 Hz')
    expect(eqBandLabel(5)).toBe('1 kHz')
    expect(eqBandLabel(9)).toBe('16 kHz')
    expect(eqBandLabel(EQ_BAND_COUNT)).toBe('')
  })
})

describe('reading a stored voicing', () => {
  it('clamps and rounds each gain, and treats junk as flat', () => {
    expect(readEqDb(99)).toBe(EQ_GAIN_RANGE_DB)
    expect(readEqDb(-99)).toBe(-EQ_GAIN_RANGE_DB)
    expect(readEqDb(2.4)).toBe(2)
    expect(readEqDb(Number.NaN)).toBe(0)
    expect(readEqDb('loud')).toBe(0)
    expect(readEqDb(null)).toBe(0)
  })

  // Upgrading must not throw a voicing away for being the wrong length: the bands that were expressed
  // keep their gain and the ones the stored array never reached start flat.
  it('pads a shorter stored array instead of discarding it', () => {
    expect(readEqBands([1, 2, 3])).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0])
    expect(readEqBands('nope')).toEqual(emptyEqBands())
  })

  it('keeps the bands it is given and cuts the ones past the table', () => {
    const stored = Array.from({ length: EQ_BAND_COUNT + 3 }, () => 4)
    expect(readEqBands(stored)).toEqual(EQ_BANDS.map(() => 4))
  })
})
