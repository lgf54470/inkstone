import { describe, expect, it, vi } from 'vitest'
import type { MusicPlaylistDetail } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      createPlaylist: vi.fn(async (input: object) => ({ id: 'pl-1', items: [], ...input })),
      patchPlaylist: vi.fn(async (id: string, patch: object) => ({ id, items: [], ...patch })),
      addPlaylistItems: vi.fn(async (_playlistId: string, trackIds: string[]) => ({
        items: trackIds.slice(0, 2).map((trackId, index) => ({ id: `new-${index}`, trackId })),
        added: 2,
        skipped: trackIds.length - 2,
      })),
    },
  },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastUploadError: vi.fn(),
}))

import { api } from '../../../lib/api'
import { addSelectionToPlaylist, createPlaylist, renamePlaylist } from './library-collections'
import type { MusicStoreState } from './types'

function makeStore() {
  let state = { playlists: [] as MusicPlaylistDetail[] } as unknown as MusicStoreState
  return {
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    get: () => state,
  }
}

describe('playlist description persistence', () => {
  it('createPlaylist trims and forwards the description to the API', async () => {
    const store = makeStore()
    await createPlaylist(store.set, ' Late Night ', '  best of the year  ')
    expect(api.music.createPlaylist).toHaveBeenCalledWith({ name: 'Late Night', description: 'best of the year' })
  })

  it('createPlaylist without a description sends none instead of an empty string', async () => {
    const store = makeStore()
    await createPlaylist(store.set, 'Late Night')
    expect(api.music.createPlaylist).toHaveBeenCalledWith({ name: 'Late Night', description: undefined })
  })

  it('renamePlaylist forwards an edited description in the patch', async () => {
    const store = makeStore()
    await renamePlaylist(store.set, 'pl-1', 'New name', 'new note')
    expect(api.music.patchPlaylist).toHaveBeenCalledWith('pl-1', { name: 'New name', description: 'new note' })
  })

  it('renamePlaylist without a description leaves the stored one untouched', async () => {
    const store = makeStore()
    await renamePlaylist(store.set, 'pl-1', 'New name')
    const calls = vi.mocked(api.music.patchPlaylist).mock.calls
    const patch = calls[calls.length - 1]?.[1] as Record<string, unknown>
    expect(patch).toEqual({ name: 'New name' })
    expect('description' in patch).toBe(false)
  })
})

describe('playlist multi-select add', () => {
  it('sends the whole selection in one batch request and merges the added items', async () => {
    const store = makeStore()
    store.set({
      selectedIds: ['t1', 't2', 't3'],
      playlists: [{
        id: 'pl-1', name: 'Road', items: [{ id: 'i0', playlistId: 'pl-1', trackId: 't9', sortOrder: 0 }],
      } as unknown as MusicPlaylistDetail],
    })

    await addSelectionToPlaylist(store.set, store.get, 'pl-1')

    expect(api.music.addPlaylistItems).toHaveBeenCalledTimes(1)
    expect(api.music.addPlaylistItems).toHaveBeenCalledWith('pl-1', ['t1', 't2', 't3'])
    const merged = store.get().playlists[0].items
    expect(merged.map((item) => item.trackId)).toEqual(['t9', 't1', 't2'])
    expect(merged.map((item) => item.sortOrder)).toEqual([0, 1, 2])
    expect(store.get().selectedIds).toEqual([])
  })
})
