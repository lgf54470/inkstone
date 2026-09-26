import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { mediaElement } from './audio-engine'
import { MusicLoopButton } from './music-transport-widgets'
import { MIN_LOOP_MS, SLEEP_FADE_MS, progressTimeMs, resumeSleepTimer, setProgressTime, useMusic } from './music-store'

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 300_000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null,
    hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0,
    lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

// The engine binds its bridge to the element it creates, so a dispatched timeupdate
// is the same path real playback takes.
function dispatchTime(ms: number): void {
  const audio = mediaElement()
  if (!audio) throw new Error('jsdom should provide an Audio constructor')
  audio.currentTime = ms / 1000
  audio.dispatchEvent(new Event('timeupdate'))
}

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, loopRange: null, sleepEndsAt: null, sleepMinutes: null })
  setProgressTime(0)
})

function control(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

async function mountLoopButton(): Promise<void> {
  useMusic.setState({ tracks: [track('t1')], queue: ['t1'], currentIndex: 0, loopRange: null, durationMs: 300_000 })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicLoopButton))
  })
}

describe('A-B loop (F-9)', () => {
  it('marks the start on the track being played', () => {
    useMusic.setState({ tracks: [track('t1')], queue: ['t1'], currentIndex: 0 })
    setProgressTime(12_000)
    useMusic.getState().markLoopStart()
    expect(useMusic.getState().loopRange).toEqual({ trackId: 't1', startMs: 12_000, endMs: null })
  })

  it('returns the playhead to the start once the end is passed', () => {
    useMusic.setState({
      tracks: [track('t1')], queue: ['t1'], currentIndex: 0,
      loopRange: { trackId: 't1', startMs: 1_000, endMs: 5_000 },
    })
    dispatchTime(6_000)
    expect(progressTimeMs()).toBe(1_000)
  })

  it('leaves the playhead alone when the range belongs to another track', () => {
    useMusic.setState({
      tracks: [track('t1')], queue: ['t1'], currentIndex: 0,
      loopRange: { trackId: 't2', startMs: 1_000, endMs: 5_000 },
    })
    dispatchTime(6_000)
    expect(progressTimeMs()).toBe(6_000)
  })

  it('ignores an end that is not at least a moment after the start', () => {
    useMusic.setState({
      tracks: [track('t1')], queue: ['t1'], currentIndex: 0,
      loopRange: { trackId: 't1', startMs: 4_000, endMs: null },
    })
    setProgressTime(4_000 + MIN_LOOP_MS - 1)
    useMusic.getState().markLoopEnd()
    expect(useMusic.getState().loopRange?.endMs).toBeNull()
  })

  it('clears the whole range on request', () => {
    useMusic.setState({ loopRange: { trackId: 't1', startMs: 1_000, endMs: 5_000 } })
    useMusic.getState().clearLoopRange()
    expect(useMusic.getState().loopRange).toBeNull()
  })
})

describe('sleep fade (F-9)', () => {
  function armSleep(): void {
    useMusic.setState({
      volume: 0.8,
      muted: false,
      sleepEndsAt: Date.now() + SLEEP_FADE_MS,
      sleepMinutes: 1,
      sleepAfterCurrentTrack: false,
    })
    resumeSleepTimer(useMusic.setState, () => useMusic.getState())
  }

  it('slides the volume down over the last stretch', () => {
    vi.useFakeTimers()
    armSleep()
    vi.advanceTimersByTime(SLEEP_FADE_MS / 2)
    const volume = mediaElement()?.volume ?? 1
    expect(volume).toBeGreaterThan(0)
    expect(volume).toBeLessThan(0.8)
  })

  it('hands the full volume back and disarms once the timer fires', () => {
    vi.useFakeTimers()
    armSleep()
    const audio = mediaElement()
    const pause = vi.spyOn(audio as HTMLAudioElement, 'pause')
    vi.advanceTimersByTime(SLEEP_FADE_MS + 1_000)
    expect(pause).toHaveBeenCalled()
    expect(useMusic.getState().sleepEndsAt).toBeNull()
    expect(mediaElement()?.volume).toBeCloseTo(0.8, 5)
  })
})

describe('loop controls (F-9)', () => {
  it('marks A, then B, then clears the range', async () => {
    await mountLoopButton()
    expect(control(t('music.loop_end'))?.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      control(t('music.loop_start'))?.click()
    })
    expect(useMusic.getState().loopRange).toEqual({ trackId: 't1', startMs: 0, endMs: null })
    expect(control(t('music.loop_end'))?.hasAttribute('disabled')).toBe(false)

    setProgressTime(4_000)
    await act(async () => {
      control(t('music.loop_end'))?.click()
    })
    expect(useMusic.getState().loopRange).toEqual({ trackId: 't1', startMs: 0, endMs: 4_000 })

    await act(async () => {
      control(t('music.loop_clear'))?.click()
    })
    expect(useMusic.getState().loopRange).toBeNull()
  })
})
