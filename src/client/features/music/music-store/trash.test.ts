import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listTrash: vi.fn(async () => ({ entries: [
          { id: 'tr-1', kind: 'track', name: 'one', deletedAt: 1 },
          { id: 'tr-2', kind: 'playlist', name: 'Mix', deletedAt: 2 },
        ] })),
        restoreTrash: vi.fn(async () => ({ ok: true })),
        purgeTrash: vi.fn(async () => ({ ok: true })),
      },
    },
  }
})
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { musicStoreStub } from './store.test-helpers'
import { openTrash, purgeTrashEntry, restoreFromTrash } from './trash'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({
    trashEntries: [], trashOpen: false, trashLoading: false, tracks: [],
    loadLibrary: vi.fn(async () => {}),
  } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trash store actions (FEA-B1)', () => {
  it('opens the panel and loads the entries', async () => {
    const store = makeStore()
    await openTrash(store.set)
    expect(store.get().trashOpen).toBe(true)
    expect(store.get().trashEntries).toHaveLength(2)
    expect(store.get().trashLoading).toBe(false)
  })

  it('restores an entry, reloads the library and refreshes the list', async () => {
    const store = makeStore()
    store.set({ trashOpen: true, trashEntries: [{ id: 'tr-1', kind: 'track', name: 'one', deletedAt: 1 }] })
    await restoreFromTrash(store.set, store.get, 'tr-1')
    expect(api.music.restoreTrash).toHaveBeenCalledWith('tr-1')
    expect(store.get().trashOpen).toBe(true)
    expect(store.get().trashEntries).toHaveLength(2)
  })

  it('purges an entry and drops it from the open list', async () => {
    const store = makeStore()
    store.set({ trashOpen: true, trashEntries: [{ id: 'tr-1', kind: 'track', name: 'one', deletedAt: 1 }] })
    await purgeTrashEntry(store.set, 'tr-1')
    expect(api.music.purgeTrash).toHaveBeenCalledWith('tr-1')
    expect(store.get().trashEntries).toEqual([])
  })

  it('leaves the list alone when a restore fails', async () => {
    const store = makeStore()
    store.set({ trashOpen: true, trashEntries: [{ id: 'tr-1', kind: 'track', name: 'one', deletedAt: 1 }] })
    vi.mocked(api.music.restoreTrash).mockRejectedValueOnce(new Error('offline'))
    await restoreFromTrash(store.set, store.get, 'tr-1')
    expect(store.get().trashEntries).toHaveLength(1)
  })
})
