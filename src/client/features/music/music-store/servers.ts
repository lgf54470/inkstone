import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicServerHit, MusicServerSourceInput, MusicServerTrackInput } from '../../../lib/api'
import type { MusicSet, MusicStoreState } from './types'

// FB-M16: the reader's own music server (Subsonic / Navidrome / Jellyfin / Emby), the client half
// of the worker routes in `worker/routes/music/servers.ts`. The shape mirrors the Alist slice — a
// registration list plus a one-shot search — because it is the same act: point at a server you own,
// search it, keep what you found. The credential never travels back, so the view carries who/where.
export function initialServerSourceState(): Pick<MusicStoreState,
  'serverSources' | 'serverSourcesLoading' | 'serverSourcesError' | 'serverProbe' | 'serverProbingId' | 'serverSearch'> {
  return {
    serverSources: [],
    serverSourcesLoading: false,
    serverSourcesError: null,
    serverProbe: null,
    serverProbingId: null,
    serverSearch: { serverId: null, keywords: '', hits: [], searching: false, error: null, importingItemIds: [] },
  }
}

export async function loadServerSources(set: MusicSet): Promise<void> {
  set({ serverSourcesLoading: true, serverSourcesError: null })
  try {
    const { servers } = await api.music.listServerSources()
    set({ serverSources: servers, serverSourcesLoading: false })
  } catch (error) {
    // The message stays on the panel rather than only in a toast that is gone in three seconds —
    // otherwise a failed listing and an account with no servers say exactly the same words.
    set({ serverSourcesLoading: false, serverSourcesError: error instanceof Error ? error.message : 'error' })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createServerSource(set: MusicSet, input: MusicServerSourceInput): Promise<boolean> {
  try {
    const created = await api.music.createServerSource(input)
    set((state) => ({ serverSources: [...state.serverSources, created] }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    // The worker registers the server before storing it, so a wrong URL or password lands here
    // while the reader is still looking at the form — the form stays open on `false`.
    toastMusicError(error, 'music.server_add_failed')
    return false
  }
}

export async function patchServerSource(set: MusicSet, id: string, patch: Partial<MusicServerSourceInput>): Promise<boolean> {
  try {
    const updated = await api.music.patchServerSource(id, patch)
    set((state) => ({ serverSources: state.serverSources.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function deleteServerSource(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deleteServerSource(id)
    set((state) => ({
      serverSources: state.serverSources.filter((entry) => entry.id !== id),
      // The search panel may be sitting on the server that just left; it must not keep asking it.
      serverSearch: state.serverSearch.serverId === id
        ? { ...state.serverSearch, serverId: null, hits: [], keywords: '', error: null }
        : state.serverSearch,
      serverProbe: state.serverProbe?.id === id ? null : state.serverProbe,
    }))
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

// FB-M16: a registration is only worth keeping if it answers, so "Test" is a real round trip through
// the same adapter a search uses — its verdict stays beside the row instead of in a toast.
export async function probeServerSource(set: MusicSet, id: string): Promise<boolean> {
  set({ serverProbingId: id, serverProbe: null })
  try {
    await api.music.probeServerSource(id)
    set({ serverProbingId: null, serverProbe: { id, state: 'ok', error: null } })
    return true
  } catch (error) {
    set({
      serverProbingId: null,
      serverProbe: { id, state: 'error', error: error instanceof Error ? error.message : 'error' },
    })
    return false
  }
}

export function selectServerSourceForSearch(set: MusicSet, serverId: string): void {
  set((state) => ({ serverSearch: { ...state.serverSearch, serverId, hits: [], error: null } }))
}

export async function searchServerSource(set: MusicSet, serverId: string, keywords: string): Promise<void> {
  set((state) => ({
    serverSearch: { ...state.serverSearch, serverId, keywords, hits: [], searching: true, error: null },
  }))
  try {
    const result = await api.music.searchServerSource(serverId, keywords)
    // A late answer for a query the reader has already replaced must not overwrite the newer one.
    set((state) => (
      state.serverSearch.serverId === serverId && state.serverSearch.keywords === keywords
        ? { serverSearch: { ...state.serverSearch, hits: result.results, searching: false } }
        : {}
    ))
  } catch (error) {
    set((state) => ({
      serverSearch: {
        ...state.serverSearch,
        searching: false,
        error: error instanceof Error ? error.message : 'error',
      },
    }))
  }
}

export function clearServerSearch(set: MusicSet): void {
  set((state) => ({ serverSearch: { ...state.serverSearch, keywords: '', hits: [], error: null } }))
}

// Adding a hit registers a metadata-only reference row: the idempotency key is the (server, item)
// triple the worker derives, so pressing Add twice on the same song is a no-op rather than a dupe.
export async function importServerHit(set: MusicSet, serverId: string, hit: MusicServerHit): Promise<boolean> {
  const body: MusicServerTrackInput = {
    itemId: hit.itemId,
    title: hit.title,
    artist: hit.artist,
    album: hit.album,
    durationMs: hit.durationMs ?? undefined,
  }
  markImporting(set, hit.itemId, true)
  try {
    const track = await api.music.importServerTrack(serverId, body)
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    toastMusic('music.imported')
    return true
  } catch (error) {
    toastMusicError(error, 'music.import_failed')
    return false
  } finally {
    markImporting(set, hit.itemId, false)
  }
}

// The one-shot "add every hit" affordance the Alist panel already offers. It walks the list one at
// a time and reports how many landed, so a partial failure is visible rather than silent.
export async function importServerHits(set: MusicSet, serverId: string, hits: MusicServerHit[]): Promise<{ added: number; failed: number }> {
  let added = 0
  let failed = 0
  for (const hit of hits) {
    if (await importServerHit(set, serverId, hit)) added += 1
    else failed += 1
  }
  if (added > 0) toastMusic('music.server_added_count', { value0: added })
  return { added, failed }
}
function markImporting(set: MusicSet, itemId: string, isImporting: boolean): void {
  set((state) => ({
    serverSearch: {
      ...state.serverSearch,
      importingItemIds: isImporting
        ? [...state.serverSearch.importingItemIds, itemId]
        : state.serverSearch.importingItemIds.filter((entry) => entry !== itemId),
    },
  }))
}
