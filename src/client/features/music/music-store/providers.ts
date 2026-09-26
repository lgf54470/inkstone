import { api } from '../../../lib/api'
import type { MusicProviderTrack } from '../../../lib/api'
import type { MusicTrack } from '@shared/types'
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

export async function searchProviders(set: MusicSet, get: MusicGet, keywords: string): Promise<void> {
  const enabled = listProviders().some((provider) => provider.id === GDS_PROVIDER_ID && provider.isEnabled(get()))
  if (!enabled || !keywords.trim()) {
    set({ providerResults: null, providerSearching: false, providerKeywords: '' })
    return
  }
  set({ providerSearching: true, providerKeywords: keywords })
  try {
    const results = await searchGds(keywords)
    set((state) => (state.providerKeywords === keywords ? { providerResults: results, providerSearching: false } : {}))
  } catch (error) {
    set((state) => (state.providerKeywords === keywords ? { providerResults: [], providerSearching: false } : {}))
    toastMusicError(error, 'music.action_failed')
  }
}

// FEA-A1-4 will match a failed play against these hits; A1-3 plays a hit by
// registering the idempotent provider row and handing the player the track id.
export async function playProviderTrack(set: MusicSet, get: MusicGet, hit: MusicProviderTrack): Promise<void> {
  try {
    const track = await api.music.importProviderTrack({
      source: hit.source,
      sourceId: hit.sourceId,
      title: hit.title,
      artist: hit.artist || undefined,
      album: hit.album || undefined,
      durationMs: hit.durationMs ?? undefined,
    })
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    await get().playTrack(track.id)
  } catch (error) {
    toastMusicError(error, 'music.import_failed')
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
    .flat()
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
    return null
  }
}
