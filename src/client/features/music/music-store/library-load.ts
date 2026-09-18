import type { MusicPlaylistDetail, MusicStats, MusicTag, MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { buildSearchIndex, ensureRomanized, needsRomanization, rankTracks } from '../music-search'
import { collectTagIds } from '../music-utils'
import { pushHistory } from './state'
import type { MusicGet, MusicScope, MusicSet, MusicSort, MusicSourceFilter, MusicStoreState, MusicViewMode, TrackMenuRequest } from './types'

// Opening the hub, retrying, and several mutations all want the library at once;
// one in-flight request is shared and a just-loaded library is trusted briefly.
const LIBRARY_FRESH_MS = 60_000
let libraryRequest: Promise<void> | null = null

export async function loadLibrary(set: MusicSet, get: MusicGet, force = false): Promise<void> {
  if (!force && Date.now() - get().lastLoadedAt < LIBRARY_FRESH_MS) return
  if (libraryRequest) return libraryRequest
  set({ loading: true, loadError: null })
  libraryRequest = fetchLibrary(set)
  try {
    await libraryRequest
  } finally {
    libraryRequest = null
  }
}

async function fetchLibrary(set: MusicSet): Promise<void> {
  try {
    const library = await api.music.library()
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

export function setSort(set: MusicSet, sort: MusicSort): void {
  set({ sort })
}

export function setViewMode(set: MusicSet, viewMode: MusicViewMode): void {
  set({ viewMode })
}

// One menu instance for the whole hub; the rows only ever post requests to it.
export function openTrackMenu(set: MusicSet, menu: TrackMenuRequest): void {
  set({ trackMenu: menu })
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

export function visibleTracks(state: MusicStoreState): MusicTrack[] {
  const scoped = applySourceFilter(applyScope(state), state.sourceFilter)
  const query = state.query.trim()
  return sortTracks(query ? filterByQuery(scoped, state, query) : scoped, state.sort)
}

function applySourceFilter(tracks: MusicTrack[], filter: MusicSourceFilter): MusicTrack[] {
  if (filter === 'all') return tracks
  return tracks.filter((track) => track.source === filter)
}

function applyScope(state: MusicStoreState): MusicTrack[] {
  const scope = state.scope
  if (scope.kind === 'favorites') return state.tracks.filter((track) => track.isFavorite)
  if (scope.kind === 'pinned') return state.tracks.filter((track) => track.isPinned)
  if (scope.kind === 'recent') return recentTracks(state)
  if (scope.kind === 'tag') return filterByTag(state, scope.tagId)
  if (scope.kind === 'playlist') return playlistTracks(state, scope.playlistId)
  return state.tracks
}

function recentTracks(state: MusicStoreState): MusicTrack[] {
  const byId = new Map(state.tracks.map((track) => [track.id, track]))
  return state.recentIds
    .map((id) => byId.get(id))
    .filter((track): track is MusicTrack => Boolean(track))
}

function filterByTag(state: MusicStoreState, tagId: string): MusicTrack[] {
  const ids = collectTagIds(tagId, state.tags)
  return state.tracks.filter((track) => track.tagIds.some((id) => ids.has(id)))
}

function playlistTracks(state: MusicStoreState, playlistId: string): MusicTrack[] {
  const playlist = state.playlists.find((entry) => entry.id === playlistId)
  if (!playlist) return []
  const byId = new Map(state.tracks.map((track) => [track.id, track]))
  return playlist.items
    .map((item) => byId.get(item.trackId))
    .filter((track): track is MusicTrack => Boolean(track))
}

function filterByQuery(tracks: MusicTrack[], state: MusicStoreState, query: string): MusicTrack[] {
  const order = new Map(rankTracks(buildSearchIndex(tracks, state.romanized), query).map((id, index) => [id, index]))
  return tracks.filter((track) => order.has(track.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

export function sortTracks(tracks: MusicTrack[], sort: MusicSort): MusicTrack[] {
  const sorted = [...tracks]
  if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'artist') sorted.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))
  else if (sort === 'plays') sorted.sort((a, b) => b.playCount - a.playCount)
  else sorted.sort((a, b) => b.createdAt - a.createdAt)
  return sorted.sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
}
