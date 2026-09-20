import { fuzzyMatch } from '../../lib/fuzzy'
import type { MusicTrack } from '@shared/types'

interface SearchRow {
  id: string
  haystack: string
  romanized: string
}

type Romanizer = (text: string) => string

let romanizeSupport: Promise<Romanizer | null> | null = null

// The pinyin-pro dictionary is large: keep it behind this dynamic import so the always-mounted player never pulls it into the entry bundle.
function loadRomanizer(): Promise<Romanizer | null> {
  romanizeSupport ??= import('pinyin-pro')
    .then((module) => (text: string) => buildRomanization(module.pinyin, text))
    .catch((error: unknown) => {
      console.warn('[inkstone] pinyin search unavailable:', error)
      return null
    })
  return romanizeSupport
}

type PinyinFn = typeof import('pinyin-pro')['pinyin']

function buildRomanization(pinyin: PinyinFn, text: string): string {
  const full = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
  const initials = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
  return full.join('').concat(' ', initials.join('')).toLowerCase()
}

export function needsRomanization(query: string): boolean {
  return /[a-z]/i.test(query)
}

export interface MusicSearchIndex {
  rows: SearchRow[]
}

export function buildSearchIndex(tracks: MusicTrack[], romanized: Record<string, string>): MusicSearchIndex {
  return {
    rows: tracks.map((track) => ({
      id: track.id,
      haystack: track.title.concat(' ', track.artist, ' ', track.album).toLowerCase(),
      romanized: romanized[track.id] ?? '',
    })),
  }
}

// Romanizing a whole library blocks the thread per item; the loop yields between
// batches so typing stays responsive during the first latin search.
export const ROMANIZATION_BATCH = 200

export async function ensureRomanized(
  texts: Record<string, string>,
  existing: Record<string, string>,
  onBatch?: (partial: Record<string, string>) => void,
): Promise<Record<string, string>> {
  const missing = Object.keys(texts).filter((id) => !(id in existing))
  if (!missing.length) return existing
  const romanize = await loadRomanizer()
  if (!romanize) return existing
  const next = { ...existing }
  for (let start = 0; start < missing.length; start += ROMANIZATION_BATCH) {
    if (start > 0) await new Promise((resolve) => setTimeout(resolve, 0))
    for (const id of missing.slice(start, start + ROMANIZATION_BATCH)) next[id] = romanize(texts[id]!)
    onBatch?.({ ...next })
  }
  return next
}

// A broad query can match the whole library; a row per hit is what the list mounts, so
// matches past this many stay out of the DOM and the view says how many that left out.
export const SEARCH_RESULT_LIMIT = 200

export function rankTracks(index: MusicSearchIndex, query: string, limit = SEARCH_RESULT_LIMIT): string[] {
  const trimmed = query.trim()
  if (!trimmed) return index.rows.slice(0, limit).map((row) => row.id)
  const scored: { id: string; score: number }[] = []
  for (const row of index.rows) {
    const literal = fuzzyMatch(row.haystack, trimmed)
    const roman = row.romanized ? fuzzyMatch(row.romanized, trimmed) : null
    const score = Math.max(literal?.score ?? Number.NEGATIVE_INFINITY, roman?.score ?? Number.NEGATIVE_INFINITY)
    if (Number.isFinite(score)) scored.push({ id: row.id, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((entry) => entry.id)
}

// The list and the "matches left out" count ask the same question about the same
// library, so the last ranking is remembered by the inputs it was computed from.
let lastSearch: { tracks: MusicTrack[]; romanized: Record<string, string>; query: string; ids: string[] } | null = null

export function searchTracks(tracks: MusicTrack[], romanized: Record<string, string>, query: string): string[] {
  if (lastSearch && lastSearch.tracks === tracks && lastSearch.romanized === romanized && lastSearch.query === query) {
    return lastSearch.ids
  }
  const ids = rankTracks(buildSearchIndex(tracks, romanized), query, Number.POSITIVE_INFINITY)
  lastSearch = { tracks, romanized, query, ids }
  return ids
}
