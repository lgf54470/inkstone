import { describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../music-metadata', () => ({
  scanTrackMetadata: vi.fn(),
  probeTrackDuration: vi.fn(async () => 0),
}))
vi.mock('../../../lib/api', () => ({
  api: { music: { patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })) } },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { scanTrackMetadata } from '../music-metadata'
import { toastMusic, toastMusicNotice } from '../music-feedback'
import { refreshTrackMetadata } from './library-tracks'
import type { MusicStoreState } from './types'

function track(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 0, source: 'r2', coverUrl: null, lyric: null } as MusicTrack
}

function makeStore(tracks: MusicTrack[]) {
  let state = { tracks } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
  }
}

describe('refreshTrackMetadata', () => {
  it('skips a track whose tag scan throws and still refreshes the rest', async () => {
    vi.mocked(scanTrackMetadata)
      .mockRejectedValueOnce(new RangeError('offset is out of bounds'))
      .mockResolvedValueOnce({ coverDataUrl: null, title: null, artist: 'Someone', album: null, lyric: null, durationMs: 0 })
    const store = makeStore([track('poison-1'), track('good-1')])
    const updated = await refreshTrackMetadata(
      store.set as never,
      store.get as never,
      ['poison-1', 'good-1'],
    )
    expect(updated).toBe(1)
    expect(toastMusic).toHaveBeenCalledWith('music.metadata_refreshed', { value0: 1 })
  })

  it('notices the user when every scanned track was unreadable', async () => {
    vi.mocked(scanTrackMetadata).mockRejectedValueOnce(new Error('malformed tag'))
    const store = makeStore([track('poison-1')])
    const updated = await refreshTrackMetadata(store.set as never, store.get as never, ['poison-1'])
    expect(updated).toBe(0)
    expect(toastMusicNotice).toHaveBeenCalledWith('music.metadata_unavailable')
  })
})
