import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_MAX_TRACKS, LYRIC_OFFSET_STEP_MS, MUSIC_PREFS_KEY, loadPreferences } from './state'
import { useMusic } from './index'

vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { toastMusicNotice } from '../music-feedback'

beforeEach(() => {
  useMusic.setState({ lyricOffsets: {} })
})

afterEach(() => {
  useMusic.setState({ lyricOffsets: {} })
  window.localStorage.clear()
})

describe('per-track lyric offset (F-1)', () => {
  it('steps in quarter seconds and clamps to the calibration window', () => {
    useMusic.getState().nudgeLyricOffset('t1', LYRIC_OFFSET_STEP_MS)
    expect(useMusic.getState().lyricOffsets.t1).toBe(LYRIC_OFFSET_STEP_MS)

    for (let step = 0; step < 120; step += 1) useMusic.getState().nudgeLyricOffset('t1', LYRIC_OFFSET_STEP_MS)
    expect(useMusic.getState().lyricOffsets.t1).toBe(LYRIC_OFFSET_LIMIT_MS)

    for (let step = 0; step < 240; step += 1) useMusic.getState().nudgeLyricOffset('t1', -LYRIC_OFFSET_STEP_MS)
    expect(useMusic.getState().lyricOffsets.t1).toBe(-LYRIC_OFFSET_LIMIT_MS)
  })

  it('keeps one track out of another track\'s calibration', () => {
    useMusic.getState().nudgeLyricOffset('t1', LYRIC_OFFSET_STEP_MS)
    expect(useMusic.getState().lyricOffsets.t2).toBeUndefined()
  })

  it('drops the stored entry once a track is back in sync', () => {
    useMusic.getState().nudgeLyricOffset('t1', LYRIC_OFFSET_STEP_MS)
    useMusic.getState().resetLyricOffset('t1')
    expect(useMusic.getState().lyricOffsets.t1).toBeUndefined()
  })

  it('widens the calibration window to thirty seconds per track', () => {
    useMusic.getState().nudgeLyricOffset('t1', 30_000)
    expect(useMusic.getState().lyricOffsets.t1).toBe(30_000)
    useMusic.getState().nudgeLyricOffset('t1', 250)
    expect(useMusic.getState().lyricOffsets.t1).toBe(LYRIC_OFFSET_LIMIT_MS)
  })
})

// A full map used to silently refuse new tracks; now it says so and still lets
// the tracks already calibrated be adjusted.
describe('lyric offset capacity (IMP-7)', () => {
  beforeEach(() => {
    const offsets: Record<string, number> = {}
    for (let index = 0; index < LYRIC_OFFSET_MAX_TRACKS; index += 1) offsets[`full-${index}`] = 250
    useMusic.setState({ lyricOffsets: offsets })
    vi.mocked(toastMusicNotice).mockClear()
  })

  it('warns and refuses a brand-new track once the map is full', () => {
    useMusic.getState().nudgeLyricOffset('latecomer', 250)
    expect(toastMusicNotice).toHaveBeenCalledWith('music.lyric_offset_full')
    expect(useMusic.getState().lyricOffsets['latecomer']).toBeUndefined()
    expect(Object.keys(useMusic.getState().lyricOffsets)).toHaveLength(LYRIC_OFFSET_MAX_TRACKS)
  })

  it('still updates a track that already holds a calibration', () => {
    useMusic.getState().nudgeLyricOffset('full-7', 250)
    expect(toastMusicNotice).not.toHaveBeenCalled()
    expect(useMusic.getState().lyricOffsets['full-7']).toBe(500)
  })
})

describe('stored lyric offsets (F-1)', () => {
  it('reads a saved offset and refuses values outside the window', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      lyricOffsets: { good: 500, negative: -250, huge: 999_999, text: 'late' },
    }))
    expect(loadPreferences().lyricOffsets).toEqual({ good: 500, negative: -250, huge: LYRIC_OFFSET_LIMIT_MS })
  })

  it('starts empty when nothing was ever calibrated', () => {
    expect(loadPreferences().lyricOffsets).toEqual({})
  })
})
