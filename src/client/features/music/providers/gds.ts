import { api } from '../../../lib/api'
import { mergeProviderResults } from './dedupe'
import type { MusicProviderTrack } from './types'

export const GDS_PROVIDER_ID = 'gds'

// The aggregate upstream serves several catalogues; rank order is the merge
// order and the de-dup preference when two sources return the same song.
export const GDS_SOURCES = ['netease', 'kuwo', 'migu', 'qq', 'bilibili'] as const

// FEA-A1-3: one aggregate search = a page per upstream source, fetched in
// parallel through the worker proxy and merged by rank. A source that fails or
// answers nothing just contributes no page — one dead catalogue must not blank
// the results of the others.
export async function searchGds(keywords: string): Promise<MusicProviderTrack[]> {
  const pages = await Promise.all(GDS_SOURCES.map(async (source) => {
    try {
      const { results } = await api.music.providerSearch(source, keywords)
      return results as MusicProviderTrack[]
    } catch {
      return []
    }
  }))
  return mergeProviderResults(pages)
}
