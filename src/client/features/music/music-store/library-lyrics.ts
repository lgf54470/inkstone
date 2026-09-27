import { ApiError, api } from '../../../lib/api'
import type { MusicTrack } from '@shared/types'
import { GDS_PROVIDER_ID, listProviders, matchScore, searchGds } from '../providers'
import { lyricSourceOrder, type MusicLyricSource } from '../music-utils'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import type { MusicGet, MusicSet } from './types'

type LyricLookup = 'lrclib' | 'catalogue'

interface LyricAnswer {
  lyric: string
  source: LyricLookup
}

// Lyrics are looked up per track on request and saved through the normal
// metadata patch, so the listener always sees exactly what lands in the library.
// FB-F13: the source list is walked in order (see `lyricSourceOrder`) and the first answer wins,
// so a preference names where to start rather than narrowing the library to one source.
export async function searchTrackLyric(
  set: MusicSet,
  get: MusicGet,
  id: string,
  source?: MusicLyricSource,
): Promise<void> {
  const track = get().tracks.find((entry) => entry.id === id)
  if (!track) return
  const wanted = source ?? get().lyricSource
  const online = isOnlineEnabled(get)
  let failure: unknown = null
  let answer: LyricAnswer | null = null
  for (const candidate of lyricSourceOrder(wanted, track)) {
    // A catalogue the reader never switched on is not a source that failed — it is one they
    // did not ask for, so in `auto` mode its turn is skipped rather than reported.
    if (candidate === 'catalogue' && !online) continue
    try {
      const lyric = candidate === 'lrclib' ? await lrclibLyric(id) : await catalogueLyric(track)
      if (lyric) {
        answer = { lyric, source: candidate }
        break
      }
    } catch (error) {
      // One source being down is not the end of the chain: the next one may still answer, and
      // only when every candidate has been tried is the reader told the lookup failed.
      failure = error
    }
  }
  if (!answer) {
    reportNothing(wanted, failure)
    return
  }
  try {
    const updated = await api.music.patchTrack(id, { lyric: answer.lyric })
    set((state) => ({ tracks: state.tracks.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.lyrics_matched_from', { value0: answer.source })
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}

// Upstream answers "no match" with a 404, which is an empty-handed answer rather than a failure.
async function lrclibLyric(id: string): Promise<string> {
  try {
    return (await api.music.searchTrackLyric(id)).lyric.trim()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return ''
    throw error
  }
}

// A catalogue row knows which song it is, so its own entry needs no search; anything else is
// matched by name against the same aggregate search the online panel runs, and the best match
// that carries a lyric id is asked for its words.
async function catalogueLyric(track: MusicTrack): Promise<string> {
  if (track.providerSource && track.providerSongId) {
    const own = (await api.music.providerLyric(track.providerSource, track.providerSongId)).lyric.trim()
    if (own) return own
  }
  const keywords = track.artist ? `${track.title} ${track.artist}` : track.title
  const { results } = await searchGds(keywords)
  const best = results
    .map((hit) => ({ hit, score: matchScore(hit, track) }))
    .filter((entry) => entry.score > 0 && entry.hit.lyricId)
    .sort((a, b) => b.score - a.score)[0]
  const lyricId = best?.hit.lyricId
  if (!best || !lyricId) return ''
  return (await api.music.providerLyric(best.hit.source, lyricId)).lyric.trim()
}

function isOnlineEnabled(get: MusicGet): boolean {
  return listProviders().some((provider) => provider.id === GDS_PROVIDER_ID && provider.isEnabled(get()))
}

function reportNothing(wanted: MusicLyricSource, failure: unknown): void {
  // The reader named one source: whatever came back describes that source. In `auto` mode an
  // error from any candidate is worth naming, because the chain was supposed to cover for it.
  if (failure && (wanted !== 'auto' || !isNotFound(failure))) {
    toastMusicError(failure, 'music.lyric_search_failed')
    return
  }
  toastMusicNotice('music.lyrics_unmatched')
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
