import type { MusicProviderTrack } from './types'

// FEA-A1-3: the aggregate search answers one page per source; the merge walks
// the pages in rank order and keeps the first hit per normalized (title,
// artist) pair, so the same song from a lower-ranked source is dropped and the
// ordering stays stable. Same title under different artists stays.
export function mergeProviderResults(pages: MusicProviderTrack[][]): MusicProviderTrack[] {
  const seen = new Set<string>()
  const merged: MusicProviderTrack[] = []
  for (const page of pages) {
    for (const hit of page) {
      const key = `${normalizeTrackText(hit.title)}|${normalizeTrackText(hit.artist)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(hit)
    }
  }
  return merged
}

export function normalizeTrackText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}
