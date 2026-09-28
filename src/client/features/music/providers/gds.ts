import { GDS_UPSTREAM_SOURCES } from '@shared/constants'
import { api } from '../../../lib/api'
import { mergeProviderResults } from './dedupe'
import type { MusicProviderTrack } from './types'

export const GDS_PROVIDER_ID = 'gds'

// FB-S4: the catalogue list lives with the constants and is read here as it is in the worker, so
// the search box cannot offer a catalogue the proxy would refuse. Rank order is the merge order
// and the de-dup preference when two sources return the same song.
export const GDS_SOURCES = GDS_UPSTREAM_SOURCES

// FB3-F1: how much one search asks for. `all` is the aggregate fan-out the panel has always done;
// any other value names a single catalogue from the same shared list the worker validates against,
// so a scope can never name something the proxy would refuse.
export const PROVIDER_SCOPE_ALL = 'all'
export const PROVIDER_SCOPES = [PROVIDER_SCOPE_ALL, ...GDS_SOURCES] as const
export type MusicProviderScope = (typeof PROVIDER_SCOPES)[number]

export function isProviderScope(value: unknown): value is MusicProviderScope {
  return typeof value === 'string' && (PROVIDER_SCOPES as readonly string[]).includes(value)
}

// FB3-S1: the request boundary is where the whitelist has to hold, whatever the caller computed. A
// name off the shared list — a stale preference, a hand-edited localStorage, a bug upstream of here —
// is dropped before a request is built from it, so an unlisted slug can never be sent.
function askableSources(sources: readonly string[]): readonly string[] {
  return sources.filter((source) => (GDS_SOURCES as readonly string[]).includes(source))
}

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
export async function searchGdsPages(keywords: string, sources: readonly string[] = GDS_SOURCES): Promise<ProviderSourcePage[]> {
  return Promise.all(askableSources(sources).map(async (source) => {
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

export async function searchGds(keywords: string, sources: readonly string[] = GDS_SOURCES): Promise<ProviderSearchOutcome> {
  const pages = await searchGdsPages(keywords, sources)
  return {
    results: mergeProviderResults(pages.map((page) => page.results)),
    failedSources: pages.filter((page) => page.status === 'error').map((page) => page.source),
  }
}
