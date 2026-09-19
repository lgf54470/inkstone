import type { MusicTrack } from '@shared/types'
import { api, type MusicBatchAction } from '../../../lib/api'
import { mapWithConcurrency } from '../../../lib/async'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { probeTrackDuration, scanTrackMetadata, type ScannedMetadata } from '../music-metadata'
import { isArtistSuffixedTitle, TRACK_IO_CONCURRENCY } from '../music-utils'
import { summarizeLibrary } from './library-load'
import { forgetOfflineTracks } from './offline'
import { runLibraryJob } from './transfers'
import type { MusicGet, MusicSet, MusicStoreState, MusicTrackPatchInput } from './types'

// The library ships without lyric text, so the details views ask for it by id once.
const pendingLyrics = new Set<string>()

export async function ensureTrackLyric(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  const track = get().tracks.find((entry) => entry.id === id)
  if (!track || !track.hasLyric || track.lyric !== null) return
  if (pendingLyrics.has(id)) return
  pendingLyrics.add(id)
  try {
    const { lyric } = await api.music.trackLyric(id)
    applyLocal(set, id, { lyric })
  } catch (error) {
    // Best effort: a failed lyric fetch only leaves the lyric view empty, the track still plays.
    console.warn('[inkstone] music lyric fetch failed:', error)
  } finally {
    pendingLyrics.delete(id)
  }
}

// Imported tracks often arrive without artwork or lyrics; the ID3 tag still has them.
// Force mode is for tracks whose tags were written wrong the first time: whatever
// the file carries replaces the stored value, so the user must confirm it in the UI.
export async function refreshTrackMetadata(set: MusicSet, get: MusicGet, ids: string[], force = false): Promise<number> {
  const counters = { updated: 0, unreadable: 0 }
  const byId = new Map(get().tracks.map((track) => [track.id, track]))
  const ordered = [...ids].sort((a, b) => Number(byId.get(a)?.source === 'webdav') - Number(byId.get(b)?.source === 'webdav'))
  const ran = await runLibraryJob(set, get, 'metadata', ids.length, async (advance) => {
    await mapWithConcurrency(ordered, TRACK_IO_CONCURRENCY, async (id) => {
      await refreshOneTrack(set, byId, id, counters, force)
      advance()
    })
  })
  if (!ran) return 0
  if (counters.updated > 0) toastMusic('music.metadata_refreshed', { value0: counters.updated })
  else if (counters.unreadable > 0) toastMusicNotice('music.metadata_unavailable')
  return counters.updated
}

async function refreshOneTrack(
  set: MusicSet,
  byId: Map<string, MusicTrack>,
  id: string,
  counters: { updated: number; unreadable: number },
  force: boolean,
): Promise<void> {
  const track = byId.get(id)
  if (!track) return
  let scanned: ScannedMetadata | null = null
  let durationMs = 0
  try {
    scanned = force || needsTagScan(track) ? await scanTrackMetadata(track) : null
    durationMs = track.durationMs > 0 ? 0 : (scanned?.durationMs ?? await probeTrackDuration(track))
  } catch (error) {
    // A malformed tag must only skip this track, never abort the whole scan.
    console.warn('[inkstone] music metadata scan threw:', error)
    counters.unreadable += 1
    return
  }
  const patch = scanPatch(track, scanned, durationMs, force)
  if (!Object.keys(patch).length) {
    if (!scanned?.coverDataUrl && !scanned?.lyric && !scanned?.artist) counters.unreadable += 1
    return
  }
  try {
    const updatedTrack = await api.music.patchTrack(id, patch)
    mergeTrack(set, id, updatedTrack)
    counters.updated += 1
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}

function needsTagScan(track: MusicTrack): boolean {
  return !track.coverUrl || (!track.hasLyric && !track.lyric) || !track.artist || !track.album
}

// A scan only fills gaps: manual edits and existing artwork always win.
// Force inverts that for the fields the tag carries, yet never rewrites the
// title (the suffixed-title repair applies in both modes) nor shortens a
// known duration, because those edits are the ones users cannot recover.
function scanPatch(track: MusicTrack, scanned: ScannedMetadata | null, durationMs: number, force = false): MusicTrackPatchInput {
  const patch: MusicTrackPatchInput = {}
  if (scanned?.coverDataUrl && (force || !track.coverUrl)) patch.coverDataUrl = scanned.coverDataUrl
  if (scanned?.lyric && (force || (!track.hasLyric && !track.lyric))) patch.lyric = scanned.lyric
  if (scanned?.artist && (force || !track.artist)) patch.artist = scanned.artist
  if (scanned?.album && (force || !track.album)) patch.album = scanned.album
  if (scanned?.title && isArtistSuffixedTitle(track.title, scanned.title, scanned.artist ?? '')) patch.title = scanned.title
  if (durationMs > 0) patch.durationMs = durationMs
  return patch
}

export async function patchTrack(
  set: MusicSet,
  get: MusicGet,
  id: string,
  patch: MusicTrackPatchInput,
): Promise<void> {
  const previous = get().tracks.find((track) => track.id === id)
  if (!previous) return
  applyLocal(set, id, patch)
  try {
    const updated = await api.music.patchTrack(id, patch)
    mergeTrack(set, id, updated)
  } catch (error) {
    applyLocal(set, id, previous)
    toastMusicError(error, 'music.save_failed')
  }
}

export async function toggleFavorite(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  await toggleFlag(set, get, id, 'isFavorite', 'music.favorite_added', 'music.favorite_removed')
}

export async function togglePin(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  await toggleFlag(set, get, id, 'isPinned', 'music.pin_added', 'music.pin_removed')
}

async function toggleFlag(
  set: MusicSet,
  get: MusicGet,
  id: string,
  field: 'isFavorite' | 'isPinned',
  onKey: 'music.favorite_added' | 'music.pin_added',
  offKey: 'music.favorite_removed' | 'music.pin_removed',
): Promise<void> {
  const track = get().tracks.find((entry) => entry.id === id)
  if (!track) return
  const next = !track[field]
  applyLocal(set, id, { [field]: next })
  try {
    const updated = await api.music.patchTrack(id, { [field]: next })
    mergeTrack(set, id, updated)
    toastMusic(next ? onKey : offKey)
  } catch (error) {
    applyLocal(set, id, { [field]: !next })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function deleteTrack(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  try {
    await api.music.deleteTrack(id)
    dropFromQueue(set, get, new Set([id]))
    dropTracksLocally(set, new Set([id]))
    forgetOfflineTracks(set, get, [id])
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.delete_failed')
  }
}

export async function batchTracks(set: MusicSet, get: MusicGet, action: MusicBatchAction): Promise<void> {
  const ids = get().selectedIds
  if (!ids.length) return
  try {
    await api.music.batchTracks(ids, action)
    const affected = new Set(ids)
    if (action === 'delete') {
      dropFromQueue(set, get, affected)
      dropTracksLocally(set, affected)
      forgetOfflineTracks(set, get, ids)
    } else {
      applyFlagsLocally(set, affected, action)
    }
    set({ selectedIds: [] })
    toastMusic('music.batch_done', { value0: ids.length })
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

function applyLocal(set: MusicSet, id: string, patch: Partial<MusicTrack>): void {
  set((state) => resummarize(state, {
    tracks: state.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)),
  }))
}

// Server mutation responses carry the full record; merging it keeps the local
// library authoritative without a reload.
function mergeTrack(set: MusicSet, id: string, updated: MusicTrack): void {
  set((state) => resummarize(state, {
    tracks: state.tracks.map((entry) => (entry.id === id ? updated : entry)),
  }))
}

function dropTracksLocally(set: MusicSet, removed: Set<string>): void {
  set((state) => {
    const tracks = state.tracks.filter((entry) => !removed.has(entry.id))
    const playlists = state.playlists.map((playlist) => {
      const items = playlist.items.filter((item) => !removed.has(item.trackId))
      return items.length === playlist.items.length ? playlist : { ...playlist, items, trackCount: items.length }
    })
    return resummarize(state, {
      tracks,
      playlists,
      selectedIds: state.selectedIds.filter((entry) => !removed.has(entry)),
    })
  })
}

function applyFlagsLocally(set: MusicSet, affected: Set<string>, action: MusicBatchAction): void {
  const field = action === 'favorite' || action === 'unfavorite' ? 'isFavorite' : 'isPinned'
  const value = action === 'favorite' || action === 'pin'
  set((state) => {
    const tracks = state.tracks.map((entry) => (affected.has(entry.id) ? { ...entry, [field]: value } : entry))
    return resummarize(state, { tracks })
  })
}

function resummarize(state: MusicStoreState, next: Partial<MusicStoreState>): Partial<MusicStoreState> {
  if (!state.stats) return next
  const tracks = next.tracks ?? state.tracks
  const playlists = next.playlists ?? state.playlists
  return { ...next, stats: summarizeLibrary(tracks, state.tags, playlists) }
}

export function dropFromQueue(set: MusicSet, get: MusicGet, removed: Set<string>): void {
  const { queue, currentIndex } = get()
  if (!queue.some((id) => removed.has(id))) return
  const nextQueue = queue.filter((id) => !removed.has(id))
  set({ queue: nextQueue, currentIndex: Math.max(0, Math.min(currentIndex, nextQueue.length - 1)) })
}
