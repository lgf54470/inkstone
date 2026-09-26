import { api } from '../../../lib/api'
import { mapWithConcurrency } from '../../../lib/async'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicAlistCreateInput, MusicAlistEntry, MusicAlistPatchInput } from '../../../lib/api'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

// FEA-A3: the Alist slice mirrors the WebDAV slice's shape — server registrations
// and (from A3-2 on) a browse state. The token never reaches the client; the view
// type carries name, URL and root path only.
export async function loadAlistServers(set: MusicSet): Promise<void> {
  set({ alistServersLoading: true })
  try {
    const { servers } = await api.music.listAlistServers()
    set({ alistServers: servers, alistServersLoading: false })
  } catch (error) {
    set({ alistServersLoading: false })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createAlistServer(set: MusicSet, input: MusicAlistCreateInput): Promise<boolean> {
  try {
    const created = await api.music.createAlistServer(input)
    set((state) => ({ alistServers: [...state.alistServers, created] }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function patchAlistServer(set: MusicSet, id: string, patch: MusicAlistPatchInput): Promise<boolean> {
  try {
    const updated = await api.music.patchAlistServer(id, patch)
    set((state) => ({ alistServers: state.alistServers.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function deleteAlistServer(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deleteAlistServer(id)
    set((state) => ({ alistServers: state.alistServers.filter((entry) => entry.id !== id) }))
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}


// FEA-A3-2: the browse state — one server selected at a time, a path relative to
// its root, and the per-entry import marks. Mirrors the WebDAV slice's shape so
// the modal can offer the same import-all affordance.
export function initialAlistBrowseState(): MusicStoreState['alistBrowse'] {
  return { serverId: null, path: '/', entries: [], loading: false, error: null, importingPaths: [] }
}

export async function browseAlist(set: MusicSet, serverId: string, path: string): Promise<void> {
  set((state) => ({ alistBrowse: { ...state.alistBrowse, serverId, path, loading: true, error: null } }))
  try {
    const listing = await api.music.listAlistDirectory(serverId, path)
    set((state) => ({ alistBrowse: { ...state.alistBrowse, entries: listing.entries, loading: false, path: listing.path } }))
  } catch (error) {
    set((state) => ({ alistBrowse: { ...state.alistBrowse, loading: false, error: error instanceof Error ? error.message : 'error' } }))
  }
}

export async function importAlistTrack(set: MusicSet, serverId: string, entry: MusicAlistEntry): Promise<void> {
  if (entry.isDir) {
    await browseAlist(set, serverId, entry.path)
    return
  }
  markImporting(set, entry.path, true)
  try {
    const [title, artist] = splitAlistName(entry.name.replace(/\.[^.]+$/, ''))
    const track = await api.music.importAlistTrack(serverId, { path: entry.path, title, artist })
    // Instant feedback, the same way the WebDAV import appends before the reload.
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    toastMusic('music.imported')
  } catch (error) {
    toastMusicError(error, 'music.import_failed')
  } finally {
    markImporting(set, entry.path, false)
  }
}

export async function importAlistFolder(set: MusicSet, get: MusicGet): Promise<void> {
  const state = get()
  const { serverId, entries } = state.alistBrowse
  if (!serverId) return
  const files = entries.filter((entry) => !entry.isDir)
  if (!files.length) return
  await mapWithConcurrency(files, 4, async (entry) => {
    await importAlistTrack(set, serverId, entry)
  })
  await get().loadLibrary(true)
}

function markImporting(set: MusicSet, path: string, isImporting: boolean): void {
  set((state) => ({
    alistBrowse: {
      ...state.alistBrowse,
      importingPaths: isImporting
        ? [...state.alistBrowse.importingPaths, path]
        : state.alistBrowse.importingPaths.filter((entry) => entry !== path),
    },
  }))
}

function splitAlistName(base: string): [string, string] {
  const parts = /^(.*?) - (.*)$/.exec(base)
  return parts ? [parts[1]!.trim(), parts[2]!.trim()] : [base.trim(), '']
}
