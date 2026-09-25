import type { MusicPlaylistDetail, MusicStats, MusicTag, MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { duplicateTracks } from '../music-duplicates'
import { ensureRomanized, needsRomanization, SEARCH_RESULT_LIMIT, searchTracks } from '../music-search'
import { collectTagIds } from '../music-utils'
import { pushHistory } from './state'
import type { MusicGet, MusicScope, MusicSet, MusicSort, MusicSortDirection, MusicSourceFilter, MusicStoreState, MusicViewMode, TrackMenuRequest, TrackMenuTarget } from './types'

// Opening the hub, retrying, and several mutations all want the library at once;
// one in-flight request is shared and a just-loaded library is trusted briefly.
const LIBRARY_FRESH_MS = 60_000
let libraryRequest: Promise<void> | null = null
// Validator of the library now in the store; sent back so an unchanged library
// costs one round trip instead of a full transfer.
let libraryEtag: string | null = null

export async function loadLibrary(set: MusicSet, get: MusicGet, force = false): Promise<void> {
  if (!force && Date.now() - get().lastLoadedAt < LIBRARY_FRESH_MS) return
  if (libraryRequest) return libraryRequest
  set({ loading: true, loadError: null })
  libraryRequest = fetchLibrary(set, force)
  try {
    await libraryRequest
  } finally {
    libraryRequest = null
  }
}

async function fetchLibrary(set: MusicSet, force: boolean): Promise<void> {
  try {
    const library = await api.music.library(force ? null : libraryEtag, (etag) => {
      libraryEtag = etag
    })
    // A 304 carries no body: keeping the existing arrays keeps every memo built
    // over the library — sort, grouping, tag trees — from being thrown away.
    if (!library) {
      set({ loading: false, lastLoadedAt: Date.now() })
      return
    }
    set({
      tracks: library.tracks,
      tags: library.tags,
      playlists: library.playlists,
      stats: library.stats,
      loading: false,
      lastLoadedAt: Date.now(),
    })
  } catch (error) {
    console.warn('[inkstone] music library load failed:', error)
    set({ loading: false, loadError: error instanceof Error ? error.message : 'error' })
  }
}

// Mirrors the worker's summarize; mutations that merge single records keep stats honest
// without paying for a full reload.
export function summarizeLibrary(
  tracks: MusicTrack[],
  tags: MusicTag[],
  playlists: MusicPlaylistDetail[],
): MusicStats {
  const stats: MusicStats = {
    trackCount: tracks.length,
    favoriteCount: 0,
    pinnedCount: 0,
    playlistCount: playlists.length,
    tagCount: tags.length,
    totalBytes: 0,
    totalDurationMs: 0,
  }
  for (const track of tracks) {
    if (track.isFavorite) stats.favoriteCount += 1
    if (track.isPinned) stats.pinnedCount += 1
    stats.totalBytes += track.sizeBytes
    stats.totalDurationMs += track.durationMs
  }
  return stats
}

export function setScope(set: MusicSet, scope: MusicScope): void {
  set({ scope, selectedIds: [] })
}

// Picking a new field starts at its natural direction; the header toggles from there.
export function setSort(set: MusicSet, sort: MusicSort): void {
  set({ sort, sortDirection: 'asc' })
}

export function setSortDirection(set: MusicSet, sortDirection: MusicSortDirection): void {
  set({ sortDirection })
}

export function setViewMode(set: MusicSet, viewMode: MusicViewMode): void {
  set({ viewMode })
}

// One menu instance for the whole hub; the rows only ever post requests to it.
export function openTrackMenu(set: MusicSet, get: MusicGet, menu: TrackMenuRequest): void {
  set({ trackMenu: { ...menu, target: withPlaylistIdentity(get(), menu.target) } })
}

// Rows only post the track; inside a playlist the item identity is restored here,
// which is what lets the menu offer unlink and move actions on that row.
function withPlaylistIdentity(state: MusicStoreState, target: TrackMenuTarget): TrackMenuTarget {
  const scope = state.scope
  if (target.playlistId || scope.kind !== 'playlist') return target
  const item = state.playlists
    .find((playlist) => playlist.id === scope.playlistId)
    ?.items.find((entry) => entry.trackId === target.track.id)
  return item ? { ...target, itemId: item.id, playlistId: scope.playlistId } : target
}

export function closeTrackMenu(set: MusicSet): void {
  set({ trackMenu: null })
}

export function setSourceFilter(set: MusicSet, sourceFilter: MusicSourceFilter): void {
  set({ sourceFilter })
}

// The pinyin dictionary is only needed for search, so loading the library stays cheap.
export function setQuery(set: MusicSet, get: MusicGet, query: string): void {
  set({ query })
  if (needsRomanization(query)) void get().prepareRomanization()
}

export function commitQuery(set: MusicSet, get: MusicGet, query: string): void {
  set({ query })
  const trimmed = query.trim()
  if (!trimmed) return
  set({ searchHistory: pushHistory(get().searchHistory, trimmed) })
  void get().prepareRomanization()
}

export function clearSearchHistory(set: MusicSet): void {
  set({ searchHistory: [] })
}

// One dictionary load and one romanization pass at a time; debounced keystrokes
// and lazy fetches can otherwise pile up identical whole-library work.
let romanizationRequest: Promise<void> | null = null

export function prepareRomanization(set: MusicSet, get: MusicGet): Promise<void> {
  romanizationRequest ??= runRomanization(set, get).finally(() => { romanizationRequest = null })
  return romanizationRequest
}

async function runRomanization(set: MusicSet, get: MusicGet): Promise<void> {
  const texts: Record<string, string> = {}
  for (const track of get().tracks) texts[track.id] = `${track.title} ${track.artist} ${track.album}`
  const romanized = await ensureRomanized(texts, get().romanized, (partial) => set({ romanized: partial }))
  if (romanized !== get().romanized) set({ romanized })
}

export function toggleSelect(set: MusicSet, id: string, additive: boolean): void {
  set((state) => ({
    selectedIds: additive
      ? (state.selectedIds.includes(id) ? state.selectedIds.filter((entry) => entry !== id) : [...state.selectedIds, id])
      : [id],
  }))
}

export function selectAll(set: MusicSet, ids: string[]): void {
  set({ selectedIds: ids })
}

export function invertSelection(set: MusicSet, ids: string[]): void {
  set((state) => {
    const current = new Set(state.selectedIds)
    return { selectedIds: ids.filter((id) => !current.has(id)) }
  })
}

export function clearSelection(set: MusicSet): void {
  set({ selectedIds: [] })
}

// Ranking reads these fields and nothing else, so the hook that feeds it subscribes to exactly
// this set: declaring the slice keeps the subscription list and the memo dependencies honest
// instead of letting a cast hide a field the view reads but never watches.
type MusicScopeView = Pick<MusicStoreState, 'tracks' | 'playlists' | 'tags' | 'scope'>
export type MusicLibraryView = MusicScopeView & Pick<MusicStoreState, 'sourceFilter' | 'query' | 'sort' | 'sortDirection' | 'romanized'>

// The "matches left out" notice ranks the same way, minus the order it never applies.
export type MusicMatchCountView = MusicScopeView & Pick<MusicStoreState, 'sourceFilter' | 'query' | 'romanized'>

export function visibleTracks(state: MusicLibraryView): MusicTrack[] {
  const scoped = applySourceFilter(applyScope(state), state.sourceFilter)
  const query = state.query.trim()
  const filtered = query ? filterByQuery(scoped, state, query) : scoped
  // A playlist row carries the order the user arranged; sorting or hoisting pins would rewrite it.
  // The duplicates view carries its own group order, so the same bypass applies.
  if (state.scope.kind === 'playlist' || state.scope.kind === 'duplicates') return filtered
  return sortTracks(filtered, state.sort, state.sortDirection)
}

function applySourceFilter(tracks: MusicTrack[], filter: MusicSourceFilter): MusicTrack[] {
  if (filter === 'all') return tracks
  return tracks.filter((track) => track.source === filter)
}

function applyScope(state: MusicScopeView): MusicTrack[] {
  const scope = state.scope
  if (scope.kind === 'favorites') return state.tracks.filter((track) => track.isFavorite)
  if (scope.kind === 'pinned') return state.tracks.filter((track) => track.isPinned)
  if (scope.kind === 'recent') return recentTracks(state)
  // The browse kinds draw a grouped grid, not a track list; the list stays empty on purpose.
  if (scope.kind === 'albums' || scope.kind === 'artists') return []
  if (scope.kind === 'duplicates') return duplicateTracks(state.tracks)
  if (scope.kind === 'album') return state.tracks.filter((track) => track.artist === scope.artist && track.album === scope.album)
  if (scope.kind === 'artist') return state.tracks.filter((track) => track.artist === scope.artist)
  if (scope.kind === 'tag') return filterByTag(state, scope.tagId)
  if (scope.kind === 'playlist') return playlistTracks(state, scope.playlistId)
  return state.tracks
}

// FEAT-9: recency is the server-stamped last play, so the list survives a device switch.
function recentTracks(state: MusicScopeView): MusicTrack[] {
  return state.tracks
    .filter((track) => track.lastPlayedAt !== null)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
}

function filterByTag(state: MusicScopeView, tagId: string): MusicTrack[] {
  const ids = collectTagIds(tagId, state.tags)
  return state.tracks.filter((track) => track.tagIds.some((id) => ids.has(id)))
}

function playlistTracks(state: MusicScopeView, playlistId: string): MusicTrack[] {
  const playlist = state.playlists.find((entry) => entry.id === playlistId)
  if (!playlist) return []
  const byId = new Map(state.tracks.map((track) => [track.id, track]))
  return playlist.items
    .map((item) => byId.get(item.trackId))
    .filter((track): track is MusicTrack => Boolean(track))
}

function filterByQuery(tracks: MusicTrack[], state: MusicLibraryView, query: string): MusicTrack[] {
  const ranked = searchTracks(tracks, state.romanized, query).slice(0, SEARCH_RESULT_LIMIT)
  const order = new Map(ranked.map((id, index) => [id, index]))
  return tracks.filter((track) => order.has(track.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

// The list stops at SEARCH_RESULT_LIMIT matches; the ones that did not fit are counted
// here so the header can say the list is a prefix rather than the whole answer. A scope
// that cannot hold more matches than the cap short-circuits before ranking anything.
export function hiddenMatchCount(state: MusicMatchCountView): number {
  const query = state.query.trim()
  if (!query) return 0
  const scoped = applySourceFilter(applyScope(state), state.sourceFilter)
  if (scoped.length <= SEARCH_RESULT_LIMIT) return 0
  return Math.max(0, searchTracks(scoped, state.romanized, query).length - SEARCH_RESULT_LIMIT)
}

// The comparator describes the natural ascending order of the field; the
// stored direction only flips it, and pins stay hoisted in both directions.
function compareByField(a: MusicTrack, b: MusicTrack, sort: MusicSort): number {
  if (sort === 'title') return a.title.localeCompare(b.title)
  if (sort === 'artist') return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
  if (sort === 'album') return a.album.localeCompare(b.album) || a.title.localeCompare(b.title)
  if (sort === 'duration') return a.durationMs - b.durationMs
  if (sort === 'plays') return b.playCount - a.playCount
  return b.createdAt - a.createdAt
}

export function sortTracks(tracks: MusicTrack[], sort: MusicSort, direction: MusicSortDirection = 'asc'): MusicTrack[] {
  const flip = direction === 'desc' ? -1 : 1
  return [...tracks].sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || flip * compareByField(a, b, sort))
}
