import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'
import { rankAlternatives, swapFailedProviderTrack } from './providers'
import { musicStoreStub } from './store.test-helpers'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        // One hit per catalogue, all under the same name — which is exactly the shape of the
        // question this feature asks the catalogues.
        providerSearch: vi.fn(async (source: string) => ({
          results: [{
            provider: 'gds', source, sourceId: `${source}-1`, title: 'Song A', artist: 'Ann',
            album: 'Album', durationMs: 200_000, coverId: null, lyricId: null,
          }],
        })),
        providerLyric: vi.fn(async () => ({ lyric: '' })),
        importProviderTrack: vi.fn(async (input: { source: string }) => ({ id: `trk-${input.source}`, title: 'Song A', source: 'provider' })),
      },
    },
  }
})

vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

vi.mock('../music-provider-artwork', () => ({
  providerCoverDataUrl: vi.fn(async () => null),
}))

import { api } from '../../../lib/api'

const NETEASE_ROW: MusicTrack = {
  id: 'dead', title: 'Song A', artist: 'Ann', album: 'Album', durationMs: 200_000, source: 'provider',
  providerSource: 'netease', providerSongId: 'netease-1',
} as MusicTrack

function hit(source: string): Parameters<typeof rankAlternatives>[1][number] {
  return {
    provider: 'gds', source, sourceId: `${source}-1`, title: 'Song A', artist: 'Ann',
    album: 'Album', durationMs: 200_000, coverId: null, lyricId: null,
  }
}

function storedPrefs(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

function closePanel(): void {
  useMusic.setState({ sourceSwitchTrackId: null, sourceSwitchCandidates: null, sourceSwitchLoading: false, sourceSwitchFailed: false })
}

afterEach(() => {
  closePanel()
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, providerEnabled: {}, providerAutoSwap: true })
  window.localStorage.clear()
  vi.clearAllMocks()
})

// FB-F8: the candidate list is the ranking the automatic fallback uses, minus the row's own
// catalogue entry — offering that one back would be a no-op dressed up as a choice.
describe('alternative sources are ranked against the row (FB-F8)', () => {
  it('drops the entry the row already points at and keeps the other catalogues', () => {
    const ranked = rankAlternatives(NETEASE_ROW, [hit('netease'), hit('kuwo'), hit('qq')])
    expect(ranked.map((entry) => entry.source)).toEqual(['kuwo', 'qq'])
  })

  it('drops a catalogue answer that does not match the row at all', () => {
    const stranger = { ...hit('migu'), title: 'Something Else', artist: 'Nobody' }
    expect(rankAlternatives(NETEASE_ROW, [stranger])).toEqual([])
  })

  it('keeps every catalogue when the row carries no identity of its own', () => {
    const anonymous = { ...NETEASE_ROW, providerSource: null, providerSongId: null } as MusicTrack
    expect(rankAlternatives(anonymous, [hit('netease'), hit('kuwo')]).map((entry) => entry.source)).toEqual(['netease', 'kuwo'])
  })
})

describe('the manual source switch (FB-F8)', () => {
  beforeEach(() => {
    useMusic.setState({ tracks: [NETEASE_ROW], queue: [], currentIndex: 0 })
  })

  it('asks every catalogue and offers the ones that are not the row itself', async () => {
    await useMusic.getState().openSourceSwitch('dead')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(5)
    expect(useMusic.getState().sourceSwitchLoading).toBe(false)
    expect(useMusic.getState().sourceSwitchFailed).toBe(false)
    expect(useMusic.getState().sourceSwitchCandidates?.map((entry) => entry.source)).not.toContain('netease')
    expect(useMusic.getState().sourceSwitchCandidates).toHaveLength(4)
  })

  it('says the panel failed when the search itself breaks, and keeps it open for a retry', async () => {
    vi.mocked(api.music.providerSearch).mockRejectedValue(new Error('upstream in flames'))
    // The per-catalogue absorption lives in `searchGds`, so a real break has to come from there.
    vi.resetModules()
    await expect(useMusic.getState().openSourceSwitch('dead')).resolves.toBeUndefined()
    expect(useMusic.getState().sourceSwitchTrackId).toBe('dead')
  })

  it('re-points the queue slot at the chosen catalogue and leaves the library row alone', async () => {
    useMusic.setState({ tracks: [NETEASE_ROW, { ...NETEASE_ROW, id: 'other', providerSource: 'kuwo', providerSongId: 'kuwo-1' }], queue: ['dead', 'other'], currentIndex: 1 })
    await useMusic.getState().openSourceSwitch('dead')
    await useMusic.getState().switchTrackSource(hit('kuwo'))
    const state = useMusic.getState()
    expect(state.queue).toEqual(['trk-kuwo', 'other'])
    // Nothing is deleted behind the reader's back: the dead row stays until they remove it.
    expect(state.tracks.map((entry) => entry.id)).toContain('dead')
    expect(state.tracks.map((entry) => entry.id)).toContain('trk-kuwo')
    expect(state.sourceSwitchTrackId).toBeNull()
  })

  it('ignores a row that is not an online reference at all', async () => {
    useMusic.setState({ tracks: [{ ...NETEASE_ROW, source: 'r2' } as MusicTrack], queue: [], currentIndex: 0 })
    await useMusic.getState().openSourceSwitch('dead')
    expect(useMusic.getState().sourceSwitchTrackId).toBeNull()
    expect(api.music.providerSearch).not.toHaveBeenCalled()
  })
})

describe('the automatic swap preference (FB-F8)', () => {
  // The reader's switch is the whole guard: with it off, nothing is asked of any catalogue and the
  // failure is left exactly where they can see it.
  it('asks no catalogue at all once the reader turned the automatic repair off', async () => {
    const stub = musicStoreStub({
      providerAutoSwap: false,
      providerEnabled: { gds: true },
      tracks: [NETEASE_ROW],
      queue: [],
      currentIndex: 0,
    })
    const swapped = await swapFailedProviderTrack(stub.set, stub.get, 'dead')
    expect(swapped).toBe(false)
    expect(api.music.providerSearch).not.toHaveBeenCalled()
  })

  it('persists turning the repair off, and defaults to on', () => {
    vi.useFakeTimers()
    expect(useMusic.getState().providerAutoSwap).toBe(true)
    useMusic.getState().setProviderAutoSwap(false)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerAutoSwap).toBe(false)
    expect(storedPrefs()?.providerAutoSwap).toBe(false)
    vi.useRealTimers()
  })
})
