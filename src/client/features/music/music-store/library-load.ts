import type { MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { buildSearchIndex, ensureRomanized, needsRomanization, rankTracks } from '../music-search'
import { collectTagIds } from '../music-utils'
import { pushHistory } from './state'
import type { MusicGet, MusicScope, MusicSet, MusicSort, MusicSourceFilter, MusicStoreState, MusicViewMode } from './types'

export async function loadLibrary(set: MusicSet): Promise<void> {
  set({ loading: true, loadError: null })
  try {
    const library = await api.music.library()
    set({
      tracks: library.tracks,
      tags: library.tags,
      playlists: library.playlists,
      stats: library.stats,
      loading: false,
    })
  } catch (error) {
    set({ loading: false, loadError: error instanceof Error ? error.message : 'error' })
  }
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

export async function prepareRomanization(set: MusicSet, get: MusicGet): Promise<void> {
  const texts: Record<string, string> = {}
  for (const track of get().tracks) texts[track.id] = `${track.title} ${track.artist} ${track.album}`
  const romanized = await ensureRomanized(texts, get().romanized)
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
