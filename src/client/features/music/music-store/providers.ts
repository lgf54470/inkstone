import { api } from '../../../lib/api'
import type { MusicProviderTrack } from '../../../lib/api'
import { listProviders } from '../providers'
import { GDS_PROVIDER_ID, searchGds } from '../providers'
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
