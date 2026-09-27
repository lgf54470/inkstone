import { api } from '../../../lib/api'
import type { MusicProviderTrack, MusicProviderTrackImportInput } from '../../../lib/api'
import type { MusicProviderQuality } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import { providerCoverDataUrl } from '../music-provider-artwork'
import { GDS_PROVIDER_ID, listProviders, matchScore, searchGds, searchGdsPages } from '../providers'
import { persist } from './persist'
import { toastMusicError } from '../music-feedback'
import type { MusicGet, MusicSet } from './types'

// FEA-A1-1: the online-source switches. Nothing runs unless the user turned a
// provider on; A1-3 adds the aggregate search and the play path behind them.
export function setProviderEnabled(set: MusicSet, get: MusicGet, providerId: string, enabled: boolean): void {
  set((state) => ({ providerEnabled: { ...state.providerEnabled, [providerId]: enabled } }))
  persist(get)
}

// FB-F7: the tier is a preference, not a per-request argument — the stream URL reads it, so
// every play of a provider row asks the proxy for the same quality.
export function setProviderQuality(set: MusicSet, get: MusicGet, quality: MusicProviderQuality): void {
  set({ providerQuality: quality })
  persist(get)
}

// FB-S6: remembered with the preferences, so the notice is a once-per-install decision
// rather than a speed bump in front of every switch.
export function acceptProviderNotice(set: MusicSet, get: MusicGet): void {
  set({ providerNoticeAccepted: true })
  persist(get)
}

export async function searchProviders(set: MusicSet, get: MusicGet, keywords: string): Promise<void> {
  const enabled = listProviders().some((provider) => provider.id === GDS_PROVIDER_ID && provider.isEnabled(get()))
  if (!enabled || !keywords.trim()) {
    set({ providerResults: null, providerFailedSources: [], providerSearching: false, providerKeywords: '' })
    return
  }
  set({ providerSearching: true, providerKeywords: keywords })
  try {
    const { results, failedSources } = await searchGds(keywords)
    set((state) => (state.providerKeywords === keywords ? { providerResults: results, providerFailedSources: failedSources, providerSearching: false } : {}))
  } catch (error) {
    // FB-C1: `searchGds` absorbs a dead catalogue per source, so reaching this branch means
    // something outside the catalogue contract went wrong (a shape change upstream, a bug in
    // the merge). The reader is told through the toast and the panel falls back to "no online
    // matches" rather than pretending a source list failed that we cannot name.
    set((state) => (state.providerKeywords === keywords ? { providerResults: [], providerFailedSources: [], providerSearching: false } : {}))
    toastMusicError(error, 'music.action_failed')
  }
}

// FEA-A1-4 will match a failed play against these hits; A1-3 plays a hit by
// registering the idempotent provider row and handing the player the track id.
export async function playProviderTrack(set: MusicSet, get: MusicGet, hit: MusicProviderTrack): Promise<void> {
  try {
    const track = await api.music.importProviderTrack(await resolveImportInput(hit))
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    await get().playTrack(track.id)
  } catch (error) {
    toastMusicError(error, 'music.import_failed')
  }
}

// FB-F5: adding a hit is the only moment the ids the search handed out are still in hand — after
// the row is written there is nothing left to ask the catalogue with. Both lookups are best
// effort: a catalogue that will not answer about its own artwork or words still gets the song
// added, without them.
async function resolveImportInput(hit: MusicProviderTrack): Promise<MusicProviderTrackImportInput> {
  const [lyric, coverDataUrl] = await Promise.all([
    fetchProviderLyric(hit),
    providerCoverDataUrl(hit.source, hit.coverId),
  ])
  return {
    source: hit.source,
    sourceId: hit.sourceId,
    title: hit.title,
    artist: hit.artist || undefined,
    album: hit.album || undefined,
    durationMs: hit.durationMs ?? undefined,
    lyric: lyric ?? undefined,
    coverDataUrl: coverDataUrl ?? undefined,
  }
}

async function fetchProviderLyric(hit: MusicProviderTrack): Promise<string | null> {
  // Most catalogues keep the words under the song id itself; when the hit names its own lyric id,
  // that is the one it asked to be used.
  const id = hit.lyricId ?? hit.sourceId
  if (!id) return null
  try {
    const { lyric } = await api.music.providerLyric(hit.source, id)
    return lyric.trim() || null
  } catch (error) {
    // Best effort by design — the add continues without words, and the reader is not told about a
    // lookup they did not ask for. The reason is logged rather than swallowed.
    console.warn('[inkstone] music provider lyric lookup failed:', error)
    return null
  }
}

// FEA-A1-4: repair a failed provider play by re-serving the song from another
// catalogue. Every source's own page is searched (the merged list would hide
// the lower-ranked duplicate a dead link should fail over to), hits are scored
// against the failed track, and registration is idempotent — so a hit that
// resolves back to the failed row itself, the same dead song on its original
// source, is skipped and the next candidate tried. The queue slot is rewritten
// in place; false hands the failure back to the player's normal skip path.
export async function swapFailedProviderTrack(set: MusicSet, get: MusicGet, trackId: string): Promise<boolean> {
  const state = get()
  const track = state.tracks.find((entry) => entry.id === trackId)
  if (!track || track.source !== 'provider' || !track.title.trim()) return false
  if (!listProviders().some((provider) => provider.isEnabled(state))) return false
  const keywords = track.artist ? `${track.title} ${track.artist}` : track.title
  const ranked = (await searchGdsPages(keywords))
    .flatMap((page) => page.results)
    .map((hit) => ({ hit, score: matchScore(hit, track) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  for (const { hit } of ranked) {
    const replacement = await importCandidate(hit)
    if (!replacement || replacement.id === trackId) continue
    set((current) => ({
      tracks: current.tracks.some((entry) => entry.id === replacement.id) ? current.tracks : [...current.tracks, replacement],
      queue: current.queue.map((id) => (id === trackId ? replacement.id : id)),
    }))
    return true
  }
  return false
}

// Best effort: a candidate that cannot be registered just drops out of the
// ranking; the player's normal failure path still runs underneath.
async function importCandidate(hit: MusicProviderTrack): Promise<MusicTrack | null> {
  try {
    return await api.music.importProviderTrack({
      source: hit.source,
      sourceId: hit.sourceId,
      title: hit.title,
      artist: hit.artist || undefined,
      album: hit.album || undefined,
      durationMs: hit.durationMs ?? undefined,
    })
  } catch {
    // FB-C1: fallback ranking only — a candidate that will not register is skipped and the
    // next one is tried, and the caller still reports failure if none of them lands.
    return null
  }
}
