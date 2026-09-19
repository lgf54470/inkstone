import { api, ApiError } from '../../../lib/api'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import type { MusicGet, MusicSet } from './types'

// Lyrics are looked up per track on request and saved through the normal
// metadata patch, so the listener always sees exactly what lands in the library.
export async function searchTrackLyric(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  if (!get().tracks.some((entry) => entry.id === id)) return
  let lyric: string
  try {
    lyric = (await api.music.searchTrackLyric(id)).lyric
  } catch (error) {
    // Upstream answers "no match" with a 404; that is an empty-handed result,
    // not a failure the listener needs an error toast for.
    if (error instanceof ApiError && error.status === 404) toastMusicNotice('music.lyrics_unmatched')
    else toastMusicError(error, 'music.lyric_search_failed')
    return
  }
  try {
    const updated = await api.music.patchTrack(id, { lyric })
    set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.lyrics_matched')
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}
