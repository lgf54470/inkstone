import { describe, expect, it } from 'vitest'
import { activeLyricIndex, activeLyricWindow, parseLyric } from './music-lyrics'

const LRC = ['[00:12.30]first line', '[00:15.00]second line', '[00:18.50]third line'].join('\n')

describe('parseLyric', () => {
  it('reads timestamps, sorts them and ignores untimed rows', () => {
    const lines = parseLyric('[00:15.00]later\nno timestamp\n[00:12.30]earlier')
    expect(lines.map((line) => line.text)).toEqual(['earlier', 'later'])
    expect(lines[0]?.timeMs).toBe(12_300)
  })

  it('expands a row carrying several timestamps', () => {
    const lines = parseLyric('[00:01.00][00:03.00]chorus')
    expect(lines.map((line) => line.timeMs)).toEqual([1000, 3000])
    expect(parseLyric(null)).toEqual([])
    expect(parseLyric('plain text without timing')).toEqual([])
  })
})

describe('activeLyricWindow', () => {
  const lines = parseLyric(LRC)

  it('returns the current and next line for a position', () => {
    expect(activeLyricIndex(lines, 12_400)).toBe(0)
    expect(activeLyricWindow(lines, 12_400)).toEqual({ current: 'first line', next: 'second line' })
    expect(activeLyricWindow(lines, 60_000)).toEqual({ current: 'third line', next: null })
  })

  it('shows the opening line before playback starts', () => {
    expect(activeLyricWindow(lines, 0)).toEqual({ current: 'first line', next: 'second line' })
    expect(activeLyricWindow([], 0)).toEqual({ current: null, next: null })
  })
})
