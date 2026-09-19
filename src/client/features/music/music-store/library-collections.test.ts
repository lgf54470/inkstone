import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      reorderPlaylist: vi.fn(async (playlistId: string, itemIds: string[]) => ({
        id: playlistId,
        items: itemIds.map((id, index) => ({ id, playlistId, trackId: `track-${id}`, sortOrder: index })),
      })),
      sharePlaylist: vi.fn(async (id: string) => ({ id, items: [], shareSlug: 'slug-1' })),
      unsharePlaylist: vi.fn(async (id: string) => ({ id, items: [], shareSlug: null })),
    },
  },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastUploadError: vi.fn(),
}))

import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import { addSelectionToPlaylist, createPlaylist, movePlaylistItem, movePlaylistItemToIndex, renamePlaylist, sharePlaylist, unsharePlaylist } from './library-collections'
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

describe('movePlaylistItem', () => {
  beforeEach(() => {
    vi.mocked(api.music.reorderPlaylist).mockClear()
  })

  function makePlaylistStore() {
    let state = {
      playlists: [{
        id: 'p1',
        name: 'Road',
        trackCount: 3,
        items: [
          { id: 'i1', playlistId: 'p1', trackId: 't1', sortOrder: 0 },
          { id: 'i2', playlistId: 'p1', trackId: 't2', sortOrder: 1 },
          { id: 'i3', playlistId: 'p1', trackId: 't3', sortOrder: 2 },
        ],
      } as unknown as MusicPlaylistDetail],
    } as unknown as MusicStoreState
    return {
      set: (patch: unknown) => {
        const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
        state = { ...state, ...next }
      },
      get: () => state,
    }
  }

  it('swaps the item with its neighbour and sends the full ordering', async () => {
    const store = makePlaylistStore()
    await movePlaylistItem(store.set, store.get, 'p1', 'i2', -1)
    expect(api.music.reorderPlaylist).toHaveBeenCalledWith('p1', ['i2', 'i1', 'i3'])
    expect(store.get().playlists[0].items.map((item) => item.id)).toEqual(['i2', 'i1', 'i3'])
  })

  it('drops a move past the boundary without touching the server', async () => {
    const store = makePlaylistStore()
    await movePlaylistItem(store.set, store.get, 'p1', 'i1', -1)
    await movePlaylistItem(store.set, store.get, 'p1', 'i3', 1)
    expect(api.music.reorderPlaylist).not.toHaveBeenCalled()
    expect(store.get().playlists[0].items.map((item) => item.id)).toEqual(['i1', 'i2', 'i3'])
  })

  it('keeps the stored order when the server rejects the reorder', async () => {
    vi.mocked(api.music.reorderPlaylist).mockRejectedValueOnce(new Error('conflict'))
    const store = makePlaylistStore()
    await movePlaylistItem(store.set, store.get, 'p1', 'i2', 1)
    expect(store.get().playlists[0].items.map((item) => item.id)).toEqual(['i1', 'i2', 'i3'])
    expect(toastMusicError).toHaveBeenCalled()
  })
})

describe('movePlaylistItemToIndex', () => {
  beforeEach(() => {
    vi.mocked(api.music.reorderPlaylist).mockClear()
  })

  function threeItemStore() {
    let state = {
      playlists: [{
        id: 'p1',
        name: 'Road',
        items: [
          { id: 'i1', playlistId: 'p1', trackId: 't1', sortOrder: 0 },
          { id: 'i2', playlistId: 'p1', trackId: 't2', sortOrder: 1 },
          { id: 'i3', playlistId: 'p1', trackId: 't3', sortOrder: 2 },
        ],
      } as unknown as MusicPlaylistDetail],
    } as unknown as MusicStoreState
    return {
      set: (patch: unknown) => {
        const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
        state = { ...state, ...next }
      },
      get: () => state,
    }
  }

  it('extracts the item and reinserts it at the requested index', async () => {
    const store = threeItemStore()
    await movePlaylistItemToIndex(store.set, store.get, 'p1', 'i3', 0)
    expect(api.music.reorderPlaylist).toHaveBeenLastCalledWith('p1', ['i3', 'i1', 'i2'])
    expect(store.get().playlists[0].items.map((item) => item.id)).toEqual(['i3', 'i1', 'i2'])
  })

  it('clamps an out-of-range index to the end instead of dropping the item', async () => {
    const store = threeItemStore()
    await movePlaylistItemToIndex(store.set, store.get, 'p1', 'i1', 99)
    expect(api.music.reorderPlaylist).toHaveBeenLastCalledWith('p1', ['i2', 'i3', 'i1'])
  })

  it('sends nothing when the item already sits at the index', async () => {
    const store = threeItemStore()
    await movePlaylistItemToIndex(store.set, store.get, 'p1', 'i2', 1)
    expect(api.music.reorderPlaylist).not.toHaveBeenCalled()
  })
})

describe('playlist sharing (M-51)', () => {
  function makeStoreWithPlaylist(shareSlug: string | null) {
    const store = makeStore()
    store.set({ playlists: [{ id: 'pl-1', name: 'Road', shareSlug, items: [] } as unknown as MusicPlaylistDetail] })
    return store
  }

  it('sharePlaylist merges the updated playlist and hands back the slug', async () => {
    const store = makeStoreWithPlaylist(null)
    expect(await sharePlaylist(store.set, 'pl-1')).toBe('slug-1')
    expect(store.get().playlists[0]?.shareSlug).toBe('slug-1')
  })

  it('sharePlaylist returns null and toasts on failure without touching state', async () => {
    const store = makeStoreWithPlaylist(null)
    vi.mocked(api.music.sharePlaylist).mockRejectedValueOnce(new Error('nope'))
    expect(await sharePlaylist(store.set, 'pl-1')).toBeNull()
    expect(toastMusicError).toHaveBeenCalled()
    expect(store.get().playlists[0]?.shareSlug).toBeNull()
  })

  it('unsharePlaylist clears the slug locally and confirms with a toast', async () => {
    const store = makeStoreWithPlaylist('slug-1')
    await unsharePlaylist(store.set, 'pl-1')
    expect(api.music.unsharePlaylist).toHaveBeenCalledWith('pl-1')
    expect(store.get().playlists[0]?.shareSlug).toBeNull()
    expect(toastMusic).toHaveBeenCalledWith('music.unshared_playlist')
  })
})
