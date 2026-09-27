import { afterEach, describe, expect, it, vi } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: { music: { batchTracks: vi.fn(async () => ({ ok: true, updated: 1 })) } },
  musicStreamUrl: (id: string) => `/api/music/tracks/${id}/stream`,
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import { forgetPlayHistory } from './library-tracks'
import { visibleTracks } from './library-load'
import type { MusicStoreState } from './types'

// The recent scope is what the reader sees, so the assertion goes through the view rather
// than through the raw array; the fixture carries the fields the view reads.
function recentIds(state: MusicStoreState): string[] {
  return visibleTracks({
    ...state, query: '', sort: 'recent', sortDirection: 'desc', sourceFilter: 'all', viewMode: 'list',
  }).map((track) => track.id)
}

function track(id: string, lastPlayedAt: number | null, playCount = 3): MusicTrack {
  return {
    id,
    title: id,
    artist: '',
    album: '',
    durationMs: 1000,
    sizeBytes: 0,
    source: 'r2',
    coverUrl: null,
    lyric: null,
    mime: 'audio/mpeg',
    playCount,
    lastPlayedAt,
  } as MusicTrack
}

function makeStore(tracks: MusicTrack[]) {
  const store = musicStoreStub({ tracks, scope: { kind: 'recent' } })
  return { ...store, state: store.read }
}

const batch = (): ReturnType<typeof vi.fn> => api.music.batchTracks as unknown as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.music.batchTracks).mockResolvedValue({ ok: true, updated: 1 })
})

// FB-F12: the recent view is the only place a played stamp shows, so forgetting a row is a
// server-side clear of `last_played_at` — the play count is a lifetime statistic and stays.
describe('play history removal (FB-F12)', () => {
  it('drops the asked-for rows out of the recent list and leaves the others', async () => {
    const store = makeStore([track('a', 300), track('b', 200), track('c', 100)])
    await forgetPlayHistory(store.set, ['a'])
    expect(batch()).toHaveBeenCalledWith(['a'], 'forget', undefined)
    expect(recentIds(store.state())).toEqual(['b', 'c'])
    expect(toastMusic).toHaveBeenCalledTimes(1)
    expect(toastMusicError).not.toHaveBeenCalled()
  })

  it('keeps the play count of a row it forgets', async () => {
    const store = makeStore([track('a', 300, 42)])
    await forgetPlayHistory(store.set, ['a'])
    const row = store.state().tracks[0]!
    expect(row.lastPlayedAt).toBeNull()
    expect(row.playCount).toBe(42)
  })

  it('clears a whole history in one request', async () => {
    const store = makeStore([track('a', 300), track('b', 200), track('c', 100), track('d', null)])
    await forgetPlayHistory(store.set, ['a', 'b', 'c'])
    expect(batch()).toHaveBeenCalledWith(['a', 'b', 'c'], 'forget', undefined)
    expect(recentIds(store.state())).toEqual([])
  })

  it('asks for nothing when there is nothing to forget', async () => {
    const store = makeStore([track('a', null)])
    await forgetPlayHistory(store.set, [])
    expect(batch()).not.toHaveBeenCalled()
  })

  it('leaves the rows alone and says so when the server refuses', async () => {
    const store = makeStore([track('a', 300)])
    vi.mocked(api.music.batchTracks).mockRejectedValue(new Error('offline'))
    await forgetPlayHistory(store.set, ['a'])
    expect(store.state().tracks[0]?.lastPlayedAt).toBe(300)
    expect(toastMusicError).toHaveBeenCalledTimes(1)
    expect(toastMusic).not.toHaveBeenCalled()
  })
})
