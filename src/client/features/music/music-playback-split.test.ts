import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { api } from '../../lib/api'
import { MusicSessionSync } from './music-session-sync'
import { useMusic } from './music-store'
import { progressTimeMs, setProgressTime } from './music-store/progress'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock('../../lib/api', () => ({
  api: {
    music: {
      countPlay: vi.fn(async () => {}),
      playback: vi.fn(async () => {
        throw new Error('offline')
      }),
      savePlayback: vi.fn(async () => {}),
      savePlaybackPosition: vi.fn(async () => {}),
    },
  },
}))

vi.mock('./music-feedback', () => ({
  toastMusic: vi.fn(),
  toastError: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

vi.mock('./media-session', () => ({
  bindMediaSessionActions: vi.fn(),
  publishMediaSession: vi.fn(),
  updateMediaSessionPosition: vi.fn(),
}))

let root: Root | null = null

async function mountSessionSync(): Promise<void> {
  root = createRoot(document.createElement('div'))
  await act(async () => {
    root?.render(createElement(MusicSessionSync))
  })
}

beforeEach(() => {
  setProgressTime(0)
  useMusic.setState({ queue: ['t1', 't2', 't3'], currentIndex: 0 })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.useRealTimers()
  useMusic.setState({ queue: [], currentIndex: 0 })
  setProgressTime(0)
  vi.mocked(api.music.savePlayback).mockClear()
  vi.mocked(api.music.savePlaybackPosition).mockClear()
})

describe('position is persisted apart from the queue (PERF-3)', () => {
  it('saves a drifting position without resending the queue', async () => {
    vi.useFakeTimers()
    await mountSessionSync()
    act(() => {
      setProgressTime(10_000)
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(progressTimeMs()).toBe(10_000)
    expect(api.music.savePlaybackPosition).toHaveBeenCalledWith({ currentIndex: 0, positionMs: 10_000 })
    expect(api.music.savePlayback).not.toHaveBeenCalled()
  })

  it('still writes the whole queue when the queue itself changes', async () => {
    vi.useFakeTimers()
    await mountSessionSync()
    act(() => {
      useMusic.setState({ queue: ['t1', 't2'], currentIndex: 1 })
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(api.music.savePlayback).toHaveBeenCalledWith(
      expect.objectContaining({ queue: ['t1', 't2'], currentIndex: 1 }),
    )
  })
})
