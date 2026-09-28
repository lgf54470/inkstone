import { api } from '../../../lib/api'
import type { MusicProviderTrack, MusicProviderTrackImportInput } from '../../../lib/api'
import type { MusicProviderQuality } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import type { MusicStoreState } from './types'
import { GDS_PROVIDER_ID, listProviders, matchScore, searchGds, searchGdsPages, type MusicProviderScope } from '../providers'
import { persist } from './persist'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import type { MusicGet, MusicSet } from './types'

// FB3-P1: one query is up to five upstream requests and five slots of the proxy's budget, and the
// panel re-asks on a 500ms settle — so a reader who types a word, changes their mind and comes back
// paid for the same answer twice. The memo is per (scope, keywords) and lives only in this session:
// the same question has the same answer, and the two things that make it stale — a different scope,
// or a catalogue list that has moved on — both change the key or are handled by dropping it. It is
// deliberately not persisted: an answer from an earlier visit is exactly the kind of "cache" that
// would show a reader a catalogue's last-known state as if it were current.
interface ProviderSearchMemoEntry {
  at: number
  results: MusicProviderTrack[]
  failedSources: string[]
}

const PROVIDER_SEARCH_MEMO_MAX = 20

// Long enough to cover a reader thinking between two keystrokes and short enough that coming back to
// a query later in the session still asks the catalogues.
export const PROVIDER_SEARCH_MEMO_MS = 30_000

const providerSearchMemo = new Map<string, ProviderSearchMemoEntry>()

// The reader's own gestures are what invalidate it: asking on purpose is not remembering, and a
// catalogue that has just been switched off is a state the answer was not made under.
export function clearProviderSearchCache(): void {
  providerSearchMemo.clear()
}

function readProviderSearchMemo(key: string, now: number): ProviderSearchMemoEntry | null {
  const entry = providerSearchMemo.get(key)
  if (!entry) return null
  if (now - entry.at > PROVIDER_SEARCH_MEMO_MS) {
    providerSearchMemo.delete(key)
    return null
  }
  return entry
}

function writeProviderSearchMemo(key: string, entry: ProviderSearchMemoEntry): void {
  providerSearchMemo.set(key, entry)
  // The cap only bounds what one session can hold; the oldest answer is the least likely to be asked
  // for again, and a Map iterates in insertion order.
  while (providerSearchMemo.size > PROVIDER_SEARCH_MEMO_MAX) {
    const oldest = providerSearchMemo.keys().next().value
    if (oldest === undefined) break
    providerSearchMemo.delete(oldest)
  }
}

// FEA-A1-1: the online-source switches. Nothing runs unless the user turned a
// provider on; A1-3 adds the aggregate search and the play path behind them.
export function setProviderEnabled(set: MusicSet, get: MusicGet, providerId: string, enabled: boolean): void {
  // FB3-P1: switching a catalogue off is a state the memoized answers were not made under.
  if (!enabled) clearProviderSearchCache()
  set((state) => ({ providerEnabled: { ...state.providerEnabled, [providerId]: enabled } }))
  persist(get)
}

// FB3-F1: how much one search asks for. A preference rather than a per-search argument, because the
// reader's answer to "which catalogue" does not change with every query — and the fan-out is what
// costs requests, so it has to be readable where the fan-out happens.
export function setProviderScope(set: MusicSet, get: MusicGet, scope: MusicProviderScope): void {
  set({ providerScope: scope })
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

export async function searchProviders(
  set: MusicSet,
  get: MusicGet,
  keywords: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const enabled = listProviders().some((provider) => provider.id === GDS_PROVIDER_ID && provider.isEnabled(get()))
  if (!enabled || !keywords.trim()) {
    set({ providerResults: null, providerFailedSources: [], providerSearching: false, providerKeywords: '' })
    return
  }
  const scope = get().providerScope
  const memoKey = `${scope}\n${keywords}`
  // FB3-P1: this session already asked exactly this question. The retry after a failure comes through
  // `force`, because a reader pressing retry is asking again rather than being served a memory.
  const remembered = options.force ? null : readProviderSearchMemo(memoKey, Date.now())
  if (remembered) {
    set({ providerResults: remembered.results, providerFailedSources: remembered.failedSources, providerSearching: false, providerKeywords: keywords })
    return
  }
  set({ providerSearching: true, providerKeywords: keywords })
  try {
    const { results, failedSources } = await searchGds(keywords, scope)
    writeProviderSearchMemo(memoKey, { at: Date.now(), results, failedSources })
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

// FB-F8: the automatic repair used to be unconditional. Whether a dead link may be quietly re-served
// from somewhere else is the reader's call — the switch is persisted with the other preferences.
export function setProviderAutoSwap(set: MusicSet, get: MusicGet, value: boolean): void {
  set({ providerAutoSwap: value })
  persist(get)
}

// FB-F8: the manual half of the same idea. Everything under this row's name is asked for, ranked
// against the row itself, and offered — the reader picks. FB3-F1's search scope deliberately stops
// at the search panel: the point of a switch is the catalogues the reader was *not* already
// listening to, so narrowing it would hide the very candidates this action exists to offer.
export async function openSourceSwitch(set: MusicSet, get: MusicGet, trackId: string): Promise<void> {
  const track = get().tracks.find((entry) => entry.id === trackId)
  if (!track || track.source !== 'provider') return
  set({ sourceSwitchTrackId: trackId, sourceSwitchCandidates: null, sourceSwitchLoading: true, sourceSwitchFailed: false })
  try {
    const pages = await searchGdsPages(providerKeywords(track))
    set((state) => (state.sourceSwitchTrackId === trackId
      ? { sourceSwitchCandidates: rankAlternatives(track, pages.flatMap((page) => page.results)), sourceSwitchLoading: false }
      : {}))
  } catch (error) {
    // FB-C1: `searchGdsPages` absorbs a dead catalogue per source, so arriving here means something
    // outside that contract broke. The panel says so and offers a retry — it does not close.
    set((state) => (state.sourceSwitchTrackId === trackId ? { sourceSwitchLoading: false, sourceSwitchFailed: true } : {}))
    toastMusicError(error, 'music.source_switch_failed')
  }
}

export function closeSourceSwitch(set: MusicSet): void {
  set({ sourceSwitchTrackId: null, sourceSwitchCandidates: null, sourceSwitchLoading: false, sourceSwitchFailed: false })
}

// FB-F8: the row keeps its place — id, queue slot and play counts are the library's, only the
// catalogue behind it changes. Import is idempotent, so a candidate already in the library is
// reused rather than duplicated, and the switched row is the one that plays from now on.
export async function switchTrackSource(set: MusicSet, get: MusicGet, hit: MusicProviderTrack): Promise<void> {
  const from = get().sourceSwitchTrackId
  if (!from) return
  const replacement = await importHit(set, hit)
  if (!replacement) return
  set((state) => ({
    tracks: state.tracks.some((entry) => entry.id === replacement.id) ? state.tracks : [...state.tracks, replacement],
    queue: state.queue.map((id) => (id === from ? replacement.id : id)),
    ...closeSourceSwitchState(),
  }))
  toastMusic('music.source_switched')
  // Only a row that is playing needs the player to follow it; anything else keeps its place silently.
  if (get().queue[get().currentIndex] === replacement.id) await get().playQueueAt(get().currentIndex)
}

// The row's own name is what a catalogue can be asked with; a title alone would rank noise first.
function providerKeywords(track: MusicTrack): string {
  return track.artist ? `${track.title} ${track.artist}` : track.title
}

// FB-F8: candidates are ranked the way the automatic fallback ranks them (same `matchScore`), and the
// row's own catalogue entry is left out — that is the song whose link just failed, and offering it
// back would be a no-op dressed as a choice. Other catalogues' copies of the same song are the point.
export function rankAlternatives(track: MusicTrack, hits: MusicProviderTrack[]): MusicProviderTrack[] {
  return hits
    .map((hit) => ({ hit, score: matchScore(hit, track) }))
    .filter((entry) => entry.score > 0 && !isSameProviderRow(track, entry.hit))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit)
}

function isSameProviderRow(track: MusicTrack, hit: MusicProviderTrack): boolean {
  return Boolean(track.providerSource) && track.providerSource === hit.source && track.providerSongId === hit.sourceId
}

function closeSourceSwitchState(): Partial<MusicStoreState> {
  return { sourceSwitchTrackId: null, sourceSwitchCandidates: null, sourceSwitchLoading: false, sourceSwitchFailed: false }
}

// FEA-A1-4 will match a failed play against these hits; A1-3 plays a hit by
// registering the idempotent provider row and handing the player the track id.
export async function playProviderTrack(set: MusicSet, get: MusicGet, hit: MusicProviderTrack): Promise<void> {
  const track = await importHit(set, hit)
  if (track) await get().playTrack(track.id)
}

// FB-F10: a search is how a reader browses a catalogue, and browsing must not cost them the song
// they were listening to. Taking a hit into the library writes the row and stops there; the play
// path above keeps the old "audition" meaning, where registering and playing are one gesture.
export async function addProviderTrack(set: MusicSet, hit: MusicProviderTrack): Promise<boolean> {
  const track = await importHit(set, hit)
  if (!track) return false
  toastMusic('music.provider_added', { value0: track.title })
  return true
}

// FB-F10: a selection is added one hit at a time — sequential on purpose, because five parallel
// imports would each fetch artwork and words from the same catalogue, and one dead hit must not
// take the rest of the selection down with it. The tally is what the toast reports.
export async function addProviderTracks(
  set: MusicSet,
  hits: MusicProviderTrack[],
): Promise<{ added: number; failed: number }> {
  let added = 0
  let failed = 0
  for (const hit of hits) {
    const track = await importHit(set, hit, { silent: true })
    if (track) added += 1
    else failed += 1
  }
  if (added) toastMusic('music.provider_added_batch', { value0: added })
  if (failed) toastMusicNotice('music.provider_add_failed_batch', { value0: failed })
  return { added, failed }
}

// The one place a hit becomes a library row: register it idempotently and append it to the list. A
// failure is reported by the caller — a single add names the song, a batch tallies — so the toast
// is optional here rather than always on.
async function importHit(
  set: MusicSet,
  hit: MusicProviderTrack,
  options: { silent?: boolean } = {},
): Promise<MusicTrack | null> {
  try {
    const track = await api.music.importProviderTrack(importInput(hit))
    set((state) => (state.tracks.some((entry) => entry.id === track.id) ? {} : { tracks: [...state.tracks, track] }))
    return track
  } catch (error) {
    // A single add is the reader's own gesture, so it answers with its own toast. A batch reports
    // a tally instead — one toast per failed hit would stack a wall of them.
    if (options.silent) console.warn('[inkstone] music provider batch add skipped a hit:', error)
    else toastMusicError(error, 'music.import_failed')
    return null
  }
}

// FB2-F1: the body is the metadata and the two catalogue ids — the artwork and the words are the
// worker's to resolve. Posting them from here is what broke every add: the body's ceiling is 8 KiB
// while a cover's base64 alone is several times that, so the request was refused before anybody
// read it. Both paths that write a provider row (a press of "add", the automatic repair) share this
// shape, because they write the same row.
export function importInput(hit: MusicProviderTrack): MusicProviderTrackImportInput {
  return {
    source: hit.source,
    sourceId: hit.sourceId,
    title: hit.title,
    artist: hit.artist || undefined,
    album: hit.album || undefined,
    durationMs: hit.durationMs ?? undefined,
    coverId: hit.coverId ?? undefined,
    lyricId: hit.lyricId ?? undefined,
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
  // FB-F8: the repair is a preference. With it off nobody is asked: the failure stays where the
  // reader can see it, and the manual switch in the track menu is how they re-serve the row.
  if (state.providerAutoSwap === false) return false
  const ranked = rankAlternatives(track, (await searchGdsPages(providerKeywords(track))).flatMap((page) => page.results))
  for (const hit of ranked) {
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
    return await api.music.importProviderTrack(importInput(hit))
  } catch {
    // FB-C1: fallback ranking only — a candidate that will not register is skipped and the
    // next one is tried, and the caller still reports failure if none of them lands.
    return null
  }
}
