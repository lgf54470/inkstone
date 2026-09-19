import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../../../lib/offline-audio', () => ({
  listOfflineAudioTracks: vi.fn(async () => []),
  removeTrackOffline: vi.fn(async () => true),
  saveTrackOffline: vi.fn(async () => 'saved' as const),
  trackIdFromOfflinePath: vi.fn((path: string) => {
    const match = /^\/api\/music\/tracks\/([^/]+)\/stream$/.exec(path)
    return match ? match[1] : null
  }),
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { listOfflineAudioTracks, removeTrackOffline, saveTrackOffline } from '../../../lib/offline-audio'
import { toastMusic, toastMusicNotice } from '../music-feedback'
import { forgetOfflineTracks, setTracksOffline, syncOfflineTracks, toggleTrackOffline } from './offline'
import type { MusicStoreState } from './types'

function track(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 1000, mime: 'audio/mpeg' } as MusicTrack
}

function makeStore(overrides: Partial<MusicStoreState> = {}) {
  let state = {
    tracks: [track('a'), track('b'), track('c')],
    offlineTrackIds: [] as string[],
    ...overrides,
  } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function'
        ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
        : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

beforeEach(() => {
  vi.mocked(listOfflineAudioTracks).mockReset().mockResolvedValue([])
  vi.mocked(saveTrackOffline).mockReset().mockResolvedValue('saved')
  vi.mocked(removeTrackOffline).mockReset().mockResolvedValue(true)
  vi.mocked(toastMusic).mockClear()
  vi.mocked(toastMusicNotice).mockClear()
})

describe('syncOfflineTracks', () => {
  it('adopts the device cache list and skips undecodable paths', async () => {
    vi.mocked(listOfflineAudioTracks).mockResolvedValue([
      { path: '/api/music/tracks/a/stream', sizeBytes: 5 },
      { path: '/elsewhere', sizeBytes: 5 },
    ])
    const store = makeStore()
    await syncOfflineTracks(store.set)
    expect(store.state().offlineTrackIds).toEqual(['a'])
  })

  it('keeps the previous list when no worker answers', async () => {
    vi.mocked(listOfflineAudioTracks).mockResolvedValue(null)
    const store = makeStore({ offlineTrackIds: ['a'] })
    await syncOfflineTracks(store.set)
    expect(store.state().offlineTrackIds).toEqual(['a'])
  })
})

describe('toggleTrackOffline', () => {
  it('saves a not-yet-offline track and announces it', async () => {
    const store = makeStore()
    await toggleTrackOffline(store.set, store.get, 'a')
    expect(saveTrackOffline).toHaveBeenCalledWith('a', 'audio/mpeg')
    expect(store.state().offlineTrackIds).toEqual(['a'])
    expect(toastMusic).toHaveBeenCalledWith('music.offline_saved', { value0: 1 })
  })

  it('removes an offline track instead of saving it again', async () => {
    const store = makeStore({ offlineTrackIds: ['a'] })
    await toggleTrackOffline(store.set, store.get, 'a')
    expect(saveTrackOffline).not.toHaveBeenCalled()
    expect(removeTrackOffline).toHaveBeenCalledWith('a')
    expect(store.state().offlineTrackIds).toEqual([])
    expect(toastMusic).toHaveBeenCalledWith('music.offline_removed', { value0: 1 })
  })
})

describe('batch offline saving', () => {
  it('skips tracks the device already holds and counts the rest', async () => {
    const store = makeStore({ offlineTrackIds: ['a'] })
    await setTracksOffline(store.set, store.get, ['a', 'b', 'c'], true)
    expect(vi.mocked(saveTrackOffline).mock.calls.map(([id]) => id)).toEqual(['b', 'c'])
    expect(store.state().offlineTrackIds).toEqual(['a', 'b', 'c'])
    expect(toastMusic).toHaveBeenCalledWith('music.offline_saved', { value0: 2 })
  })

  it('a quota refusal stops the loop but keeps what already saved', async () => {
    const store = makeStore()
    vi.mocked(saveTrackOffline)
      .mockResolvedValueOnce('saved')
      .mockResolvedValueOnce('quota')
      .mockResolvedValue('saved')
    await setTracksOffline(store.set, store.get, ['a', 'b', 'c'], true)
    expect(vi.mocked(saveTrackOffline)).toHaveBeenCalledTimes(2)
    expect(store.state().offlineTrackIds).toEqual(['a'])
    expect(toastMusic).toHaveBeenCalledWith('music.offline_saved', { value0: 1 })
    expect(toastMusicNotice).toHaveBeenCalledWith('music.offline_quota_full')
  })

  it('a failed save keeps going and warns once', async () => {
    const store = makeStore()
    vi.mocked(saveTrackOffline)
      .mockResolvedValueOnce('failed')
      .mockResolvedValue('saved')
    await setTracksOffline(store.set, store.get, ['a', 'b'], true)
    expect(store.state().offlineTrackIds).toEqual(['b'])
    expect(toastMusicNotice).toHaveBeenCalledWith('music.offline_save_failed')
  })
})

describe('forgetOfflineTracks on deletion', () => {
  it('silently drops deleted tracks from the device list', async () => {
    const store = makeStore({ offlineTrackIds: ['a', 'b'] })
    forgetOfflineTracks(store.set, store.get, ['a', 'missing'])
    expect(removeTrackOffline).toHaveBeenCalledWith('a')
    expect(store.state().offlineTrackIds).toEqual(['b'])
    expect(toastMusic).not.toHaveBeenCalled()
    expect(toastMusicNotice).not.toHaveBeenCalled()
  })

  it('does not touch the worker when none of the deleted tracks was offline', async () => {
    const store = makeStore()
    forgetOfflineTracks(store.set, store.get, ['a'])
    expect(removeTrackOffline).not.toHaveBeenCalled()
  })
})
