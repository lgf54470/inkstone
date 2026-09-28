import {
  listOfflineAudioTracks, removeTrackOffline, saveTrackOffline, trackIdFromOfflinePath,
  type OfflineExtras,
} from '../../../lib/offline-audio'
import { toastMusic, toastMusicNotice } from '../music-feedback'
import { persist } from './persist'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

// Offline availability lives in the service worker's cache, not in preferences:
// the bytes are per device, so every session re-reads what this device holds.
export async function syncOfflineTracks(set: MusicSet): Promise<void> {
  const tracks = await listOfflineAudioTracks()
  if (!tracks) return
  const ids = tracks
    .map((entry) => trackIdFromOfflinePath(entry.path))
    .filter((id): id is string => id !== null)
  set({ offlineTrackIds: ids })
}

export async function setTracksOffline(set: MusicSet, get: MusicGet, ids: string[], enabled: boolean): Promise<void> {
  if (enabled) await saveOfflineTracks(set, get, ids)
  else await removeOfflineTracks(set, get, ids)
}

export async function toggleTrackOffline(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  await setTracksOffline(set, get, [id], !get().offlineTrackIds.includes(id))
}

// FB3-F4: what an offline copy carries is asked for at the call site, so the two switches are read
// where the save happens rather than by the byte pump in `lib/offline-audio`.
function offlineExtras(state: Pick<MusicStoreState, 'offlineWithCover' | 'offlineWithLyric'>): OfflineExtras {
  return { cover: state.offlineWithCover, lyric: state.offlineWithLyric }
}

// FB3-F4: the two switches are preferences, not per-save arguments — the reader answers once and
// every later save of a track on this device obeys it.
export function setOfflineWithCover(set: MusicSet, get: MusicGet, enabled: boolean): void {
  set({ offlineWithCover: enabled })
  persist(get)
}

export function setOfflineWithLyric(set: MusicSet, get: MusicGet, enabled: boolean): void {
  set({ offlineWithLyric: enabled })
  persist(get)
}

// Track deletion already succeeded server-side; this only drops the device copy
// and runs unannounced because the user just watched the track disappear.
export function forgetOfflineTracks(set: MusicSet, get: MusicGet, ids: string[]): void {
  const affected = new Set(ids)
  if (!get().offlineTrackIds.some((id) => affected.has(id))) return
  set((state) => ({ offlineTrackIds: state.offlineTrackIds.filter((id) => !affected.has(id)) }))
  for (const id of affected) void removeTrackOffline(id)
}

async function saveOfflineTracks(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  let saved = 0
  let failed = false
  let quotaHit = false
  for (const id of ids) {
    if (get().offlineTrackIds.includes(id)) continue
    const track = get().tracks.find((entry) => entry.id === id)
    if (!track) continue
    const result = await saveTrackOffline(id, track.mime || 'application/octet-stream', offlineExtras(get()))
    if (result === 'quota') {
      quotaHit = true
      break
    }
    if (result !== 'saved') {
      failed = true
      continue
    }
    saved += 1
    set((state) => ({ offlineTrackIds: [...state.offlineTrackIds, id] }))
  }
  if (saved) toastMusic('music.offline_saved', { value0: saved })
  if (failed) toastMusicNotice('music.offline_save_failed')
  if (quotaHit) toastMusicNotice('music.offline_quota_full')
}

async function removeOfflineTracks(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  let removed = 0
  for (const id of ids) {
    if (!get().offlineTrackIds.includes(id)) continue
    await removeTrackOffline(id)
    removed += 1
    set((state) => ({ offlineTrackIds: state.offlineTrackIds.filter((entry) => entry !== id) }))
  }
  if (removed) toastMusic('music.offline_removed', { value0: removed })
}
