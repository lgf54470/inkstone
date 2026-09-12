import type { MusicTrack } from '@shared/types'
import { api, type MusicBatchAction } from '../../../lib/api'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { probeTrackDuration, scanTrackMetadata } from '../music-metadata'
import type { MusicGet, MusicSet, MusicTrackPatchInput } from './types'

// Imported tracks often arrive without artwork or lyrics; the ID3 tag still has them.
export async function refreshTrackMetadata(set: MusicSet, get: MusicGet, ids: string[]): Promise<number> {
  let updated = 0
  let unreadable = 0
  const byId = new Map(get().tracks.map((track) => [track.id, track]))
  const ordered = [...ids].sort((a, b) => Number(byId.get(a)?.source === 'webdav') - Number(byId.get(b)?.source === 'webdav'))
  for (const id of ordered) {
    const track = byId.get(id)
    if (!track) continue
    const scanned = needsTagScan(track) ? await scanTrackMetadata(track) : null
    const durationMs = track.durationMs > 0 ? 0 : (scanned?.durationMs ?? await probeTrackDuration(track))
    if (!scanned?.coverDataUrl && !scanned?.lyric && durationMs <= 0) {
      unreadable += 1
      continue
    }
    try {
      const updatedTrack = await api.music.patchTrack(id, {
        ...(scanned?.coverDataUrl ? { coverDataUrl: scanned.coverDataUrl } : {}),
        ...(scanned?.lyric ? { lyric: scanned.lyric } : {}),
        ...(durationMs > 0 ? { durationMs } : {}),
      })
      set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === id ? updatedTrack : entry)) }))
      updated += 1
    } catch (error) {
      toastMusicError(error, 'music.save_failed')
    }
  }
  if (updated > 0) toastMusic('music.metadata_refreshed', { value0: updated })
  else if (unreadable > 0) toastMusicNotice('music.metadata_unavailable')
  return updated
}

function needsTagScan(track: MusicTrack): boolean {
  return !track.coverUrl || !track.lyric
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
    set((state) => ({ tracks: state.tracks.map((track) => (track.id === id ? updated : track)) }))
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
    set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === id ? updated : entry)) }))
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
    await get().loadLibrary()
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
    if (action === 'delete') dropFromQueue(set, get, new Set(ids))
    set({ selectedIds: [] })
    await get().loadLibrary()
    toastMusic('music.batch_done', { value0: ids.length })
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function setTrackTags(set: MusicSet, id: string, tagIds: string[]): Promise<void> {
  applyLocal(set, id, { tagIds })
  try {
    const updated = await api.music.patchTrack(id, { tagIds })
    set((state) => ({ tracks: state.tracks.map((track) => (track.id === id ? updated : track)) }))
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}

function applyLocal(set: MusicSet, id: string, patch: Partial<MusicTrack>): void {
  set((state) => ({ tracks: state.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)) }))
}

export function dropFromQueue(set: MusicSet, get: MusicGet, removed: Set<string>): void {
  const { queue, currentIndex } = get()
  if (!queue.some((id) => removed.has(id))) return
  const nextQueue = queue.filter((id) => !removed.has(id))
  set({ queue: nextQueue, currentIndex: Math.max(0, Math.min(currentIndex, nextQueue.length - 1)) })
}
