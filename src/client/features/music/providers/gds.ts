import { api } from '../../../lib/api'
import { mergeProviderResults } from './dedupe'
import type { MusicProviderTrack } from './types'

export const GDS_PROVIDER_ID = 'gds'

// The aggregate upstream serves several catalogues; rank order is the merge
// order and the de-dup preference when two sources return the same song.
export const GDS_SOURCES = ['netease', 'kuwo', 'migu', 'qq', 'bilibili'] as const

// One source's answer, kept apart from the merged list. FB-F6: a source that failed
// and a source that simply had no match are different facts about the world, and the
// reader is the one who has to be told which one they are looking at.
export interface ProviderSourcePage {
  source: string
  status: 'ok' | 'empty' | 'error'
  results: MusicProviderTrack[]
}

export interface ProviderSearchOutcome {
  results: MusicProviderTrack[]
  failedSources: string[]
}

// One aggregate search = a page per upstream source, fetched in parallel
// through the worker proxy. A source that fails or answers nothing just
// contributes no page — one dead catalogue must not blank the results of the
// others. FEA-A1-4 needs the unmerged pages: the rank-order merge hides the
// lower-ranked duplicate that a dead link should fail over to.
export async function searchGdsPages(keywords: string): Promise<ProviderSourcePage[]> {
  return Promise.all(GDS_SOURCES.map(async (source) => {
    try {
      const { results } = await api.music.providerSearch(source, keywords)
      const hits = results as MusicProviderTrack[]
      return { source, status: hits.length ? 'ok' as const : 'empty' as const, results: hits }
    } catch {
      // FB-C1: best effort by design — a dead catalogue contributes an empty page and the
      // rest of the sources still answer. It is not swallowed silently: the page carries
      // `error`, and the caller reports the failed sources to the reader.
      return { source, status: 'error' as const, results: [] }
    }
  }))
}

export async function searchGds(keywords: string): Promise<ProviderSearchOutcome> {
  const pages = await searchGdsPages(keywords)
  return {
    results: mergeProviderResults(pages.map((page) => page.results)),
    failedSources: pages.filter((page) => page.status === 'error').map((page) => page.source),
  }
}
