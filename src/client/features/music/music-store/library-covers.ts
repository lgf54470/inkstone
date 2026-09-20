import { api } from '../../../lib/api'
import { mapWithConcurrency } from '../../../lib/async'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { lookupCoverDataUrl } from '../music-cover-lookup'
import { COVER_LOOKUP_CONCURRENCY } from '../music-utils'
import { runLibraryJob } from './transfers'
import type { MusicGet, MusicSet } from './types'

// Cover lookup reaches a public catalogue, so it only runs while the listener asks for it.
export async function matchMissingCovers(set: MusicSet, get: MusicGet): Promise<number> {
  const coverless = get().tracks.filter((entry) => !entry.coverUrl)
  if (!coverless.length) {
    toastMusicNotice('music.covers_unmatched')
    return 0
  }
  const counters = { matched: 0, failed: false }
  const ran = await runLibraryJob(set, get, 'covers', coverless.length, async (advance) => {
    // One lookup at a time made the pass as slow as the sum of every catalogue round trip. The
    // pool overlaps them, while a step and a store write still belong to a single track.
    await mapWithConcurrency(coverless, COVER_LOOKUP_CONCURRENCY, async (track) => {
      const coverDataUrl = await lookupCoverDataUrl(track.title, track.artist)
      advance()
      if (!coverDataUrl) return
      try {
        const updated = await api.music.patchTrack(track.id, { coverDataUrl })
        set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === track.id ? updated : entry)) }))
        counters.matched += 1
      } catch (error) {
        counters.failed = true
        toastMusicError(error, 'music.save_failed')
      }
    })
  })
  if (!ran) return 0
  if (counters.matched > 0) toastMusic('music.covers_matched', { value0: counters.matched })
  else if (!counters.failed) toastMusicNotice('music.covers_unmatched')
  return counters.matched
}
