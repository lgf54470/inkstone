import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_STEP_MS, MUSIC_PREFS_KEY, loadPreferences } from './state'
import { useMusic } from './index'

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

    for (let step = 0; step < 40; step += 1) useMusic.getState().nudgeLyricOffset('t1', LYRIC_OFFSET_STEP_MS)
    expect(useMusic.getState().lyricOffsets.t1).toBe(LYRIC_OFFSET_LIMIT_MS)

    for (let step = 0; step < 120; step += 1) useMusic.getState().nudgeLyricOffset('t1', -LYRIC_OFFSET_STEP_MS)
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
