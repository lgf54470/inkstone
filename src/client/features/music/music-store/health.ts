import { LIMITS } from '@shared/constants'
import { chunkIds } from '@shared/chunk'
import { mapWithConcurrency } from '../../../lib/async'
import type { MusicReferenceHealthResult } from '@shared/types'
import { api } from '../../../lib/api'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { swapFailedProviderTrack } from './providers'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

// FB-F9: which rows are worth asking about at all. R2 objects are ours and WebDAV rows belong to the
// reader's own server — both are worth a look in their own panels, but neither is a third-party link
// that goes stale without a word, which is what this scan is for.
const REFERENCE_SOURCES = new Set(['external', 'alist', 'provider'])

export function referenceTrackIds(state: MusicStoreState): string[] {
  return state.tracks.filter((track) => REFERENCE_SOURCES.has(track.source)).map((track) => track.id)
}

/** The rows a reader can act on: a refused or vanished link, not a host that was merely slow. */
export function deadReferenceIds(results: MusicReferenceHealthResult[] | null): string[] {
  return (results ?? []).filter((result) => result.status === 'dead').map((result) => result.id)
}

export async function openHealthScan(set: MusicSet, get: MusicGet): Promise<void> {
  set({ healthOpen: true })
  await scanReferences(set, get)
}

export function closeHealthScan(set: MusicSet): void {
  set({ healthOpen: false })
}

// The scan is chunked by the worker's own cap, so a library with more reference rows than one batch
// simply takes more requests rather than being refused. A chunk that fails ends the walk: the rows
// already answered keep their verdicts, and the panel says the rest could not be reached.
export async function scanReferences(set: MusicSet, get: MusicGet): Promise<void> {
  const ids = referenceTrackIds(get())
  set({ healthScanning: true, healthFailed: false })
  const results: MusicReferenceHealthResult[] = []
  let failed = false
  for (const part of chunkIds(ids, LIMITS.musicReferenceHealthMaxTracks)) {
    try {
      const answer = await api.music.checkReferenceHealth(part)
      results.push(...answer.results)
    } catch (error) {
      failed = true
      toastMusicError(error, 'music.health_failed')
      break
    }
  }
  // The verdicts are kept whether or not the panel is on screen: a scan started from the toolbar and
  // closed again still leaves the answer where the next open finds it.
  set({ healthResults: results, healthScanning: false, healthFailed: failed })
}

// The repair the review asked for: re-point the dead row at another catalogue. Unlike the manual
// switch in the track menu — where the reader may only want to listen via another source — this one
// runs from a list of rows the scan has just proved broken, so the dead row is trashed in the same
// gesture (the trash is the recoverable place; nothing is destroyed).
export async function repairDeadReference(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  if (!await repointDeadTrack(set, get, id)) {
    // No other catalogue has this song, so there is nothing to re-point the row at. The dead row
    // stays listed, which is the honest answer — and the reader can still clear it out by hand.
    toastMusicNotice('music.source_switch_none')
    return
  }
  toastMusic('music.provider_fallback_used')
}

// FB3-F7: a scan that finds several broken links used to ask the reader to press once per row. The
// same repair, applied to the whole list in one gesture, with one sentence at the end instead of one
// per row. Rows with no catalogue of their own are simply not part of it — there is nobody to ask.
const REPAIR_CONCURRENCY = 3

export async function repairDeadReferences(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  const repairable = ids.filter((id) => get().tracks.find((entry) => entry.id === id)?.source === 'provider')
  if (!repairable.length) {
    toastMusicNotice('music.source_switch_none')
    return
  }
  const outcomes = await mapWithConcurrency(repairable, REPAIR_CONCURRENCY, (id) => repointDeadTrack(set, get, id))
  const repaired = outcomes.filter(Boolean).length
  if (!repaired) {
    // Every row was asked about and no other catalogue has any of them; the list stays as it was,
    // because a row that is still broken is still the honest answer.
    toastMusicNotice('music.source_switch_none')
    return
  }
  toastMusic('music.health_repaired', { value0: repaired })
}

// The shared half of both repairs: ask the other catalogues for this song, move the dead row to the
// trash (the recoverable place; nothing is destroyed) and take it out of the panel.
async function repointDeadTrack(set: MusicSet, get: MusicGet, id: string): Promise<boolean> {
  const track = get().tracks.find((entry) => entry.id === id)
  if (!track || track.source !== 'provider') return false
  if (!await swapFailedProviderTrack(set, get, id)) return false
  const applied = await get().trashTracks([id])
  if (applied.length) set((state) => ({ healthResults: dropResults(state.healthResults, new Set(applied)) }))
  return true
}

export async function trashDeadReferences(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  if (!ids.length) return
  const applied = await get().trashTracks(ids)
  if (!applied.length) return
  set((state) => ({ healthResults: dropResults(state.healthResults, new Set(applied)) }))
  toastMusic('music.health_cleared', { value0: applied.length })
}

function dropResults(
  results: MusicReferenceHealthResult[] | null,
  removed: Set<string>,
): MusicReferenceHealthResult[] | null {
  return results ? results.filter((result) => !removed.has(result.id)) : results
}
