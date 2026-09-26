import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicTrashEntry } from '../../../lib/api'
import type { MusicGet, MusicSet } from './types'

// FEA-B1: the trash panel's state lives beside the library slice — entries load
// on open, a restore re-enters the library through the ordinary reload, and a
// purge just drops the entry from the open list.
export async function openTrash(set: MusicSet): Promise<void> {
  set({ trashOpen: true })
  await loadTrash(set)
}

export function closeTrash(set: MusicSet): void {
  set({ trashOpen: false })
}

export async function loadTrash(set: MusicSet): Promise<void> {
  set({ trashLoading: true })
  try {
    const { entries } = await api.music.listTrash()
    set({ trashEntries: entries, trashLoading: false })
  } catch (error) {
    set({ trashLoading: false })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function restoreFromTrash(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  try {
    await api.music.restoreTrash(id)
    toastMusic('music.trash_restored')
    // The restored row re-enters through the ordinary library reload, so every
    // derived view (duplicates, groups, playlists) rebuilds from server truth.
    await get().loadLibrary(true)
    await loadTrash(set)
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function purgeTrashEntry(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.purgeTrash(id)
    set((state) => ({ trashEntries: state.trashEntries.filter((entry: MusicTrashEntry) => entry.id !== id) }))
    toastMusic('music.trash_purged')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}
