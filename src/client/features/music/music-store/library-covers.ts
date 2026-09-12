import { api } from '../../../lib/api'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { lookupCoverDataUrl } from '../music-cover-lookup'
import type { MusicGet, MusicSet } from './types'

// Cover lookup reaches a public catalogue, so it only runs while the listener asks for it.
export async function matchMissingCovers(set: MusicSet, get: MusicGet): Promise<number> {
  let matched = 0
  let failed = false
  for (const track of get().tracks.filter((entry) => !entry.coverUrl)) {
    const coverDataUrl = await lookupCoverDataUrl(track.title, track.artist)
    if (!coverDataUrl) continue
    try {
      const updated = await api.music.patchTrack(track.id, { coverDataUrl })
      set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === track.id ? updated : entry)) }))
      matched += 1
    } catch (error) {
      failed = true
      toastMusicError(error, 'music.save_failed')
    }
  }
  if (matched > 0) toastMusic('music.covers_matched', { value0: matched })
  else if (!failed) toastMusicNotice('music.covers_unmatched')
  return matched
}
