import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { api } from '../../../lib/api'
import { audioElement } from '../audio-engine'
import { MusicSessionSync } from '../music-session-sync'
import { useMusic } from './index'
import { progressTimeMs, setProgressTime } from './progress'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      countPlay: vi.fn(async () => {}),
      playback: vi.fn(async () => {
        throw new Error('offline')
      }),
      savePlayback: vi.fn(async () => {}),
    },
  },
}))

vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastError: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.useRealTimers()
  useMusic.setState({ queue: [], currentIndex: 0 })
  setProgressTime(0)
  vi.mocked(api.music.savePlayback).mockClear()
})

let root: Root | null = null

async function mountSessionSync(): Promise<void> {
  root = createRoot(document.createElement('div'))
  await act(async () => {
    root?.render(createElement(MusicSessionSync))
  })
}

describe('playback progress decoupled from the library store', () => {
  it('keeps the heartbeat out of the library store state', () => {
    const state = useMusic.getState() as unknown as Record<string, unknown>
    expect('currentTimeMs' in state).toBe(false)
  })

  it('routes the audio timeupdate to the progress store only', () => {
    const audio = audioElement()
    expect(audio).not.toBeNull()
    const libraryBefore = useMusic.getState()
    act(() => {
      audio!.currentTime = 12.5
      audio!.dispatchEvent(new Event('timeupdate'))
    })
    expect(progressTimeMs()).toBe(12_500)
    expect(useMusic.getState()).toBe(libraryBefore)
  })

  it('writes a seek to the progress store without touching the library store', () => {
    const libraryBefore = useMusic.getState()
    act(() => {
      useMusic.getState().seek(5_000)
    })
    expect(progressTimeMs()).toBe(5_000)
    expect(useMusic.getState()).toBe(libraryBefore)
  })

  it('clears the displayed position when a new track takes over', async () => {
    setProgressTime(8_000)
    await act(async () => {
      await useMusic.getState().playTrack('never-scanned')
    })
    expect(progressTimeMs()).toBe(0)
  })

  it('still schedules a position save from progress ticks', async () => {
    vi.useFakeTimers()
    await mountSessionSync()
    act(() => {
      setProgressTime(10_000)
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(api.music.savePlayback).toHaveBeenCalledWith(
      expect.objectContaining({ queue: [], currentIndex: 0, positionMs: 10_000 }),
    )
  })
})
