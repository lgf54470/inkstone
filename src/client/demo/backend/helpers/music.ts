import type { MusicPlaylistDetail, MusicPlaylistItem, MusicTag, MusicTrack } from '@shared/types'
import type { DemoState } from '../../state'
import { newDemoId } from '../../state'

export function findTrack(state: DemoState, id: string): MusicTrack | null {
  return state.musicTracks.get(id)?.track ?? null
}

export function patchTrack(state: DemoState, track: MusicTrack, patch: Record<string, unknown>): MusicTrack {
  const next: MusicTrack = { ...track, updatedAt: Date.now() }
  if (typeof patch.title === 'string' && patch.title.trim()) next.title = patch.title.trim()
  if (typeof patch.artist === 'string') next.artist = patch.artist
  if (typeof patch.album === 'string') next.album = patch.album
  if (typeof patch.durationMs === 'number') next.durationMs = patch.durationMs
  if (typeof patch.coverUrl === 'string' || patch.coverUrl === null) next.coverUrl = patch.coverUrl ?? null
  if (typeof patch.lyric === 'string' || patch.lyric === null) next.lyric = patch.lyric ?? null
  if (typeof patch.isFavorite === 'boolean') next.isFavorite = patch.isFavorite
  if (typeof patch.isPinned === 'boolean') next.isPinned = patch.isPinned
  if (Array.isArray(patch.tagIds)) {
    next.tagIds = [...new Set(patch.tagIds.filter((id): id is string => typeof id === 'string' && state.musicTags.has(id)))]
  }
  return next
}

export function makeTag(name: string, color: string | null, parentId: string | null): MusicTag {
  return { id: newDemoId(), name, color, parentId, isPinned: false, sortOrder: 0, createdAt: Date.now() }
}

export function makePlaylist(name: string, description: string): MusicPlaylistDetail {
  const now = Date.now()
  return {
    id: newDemoId(),
    name,
    description,
    isPinned: false,
    isFavorite: false,
    trackCount: 0,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    items: [],
  }
}

export function makePlaylistItem(playlistId: string, trackId: string, sortOrder: number): MusicPlaylistItem {
  return { id: newDemoId(), playlistId, trackId, sortOrder }
}

export function removeTrackEverywhere(state: DemoState, trackId: string): void {
  state.musicTracks.delete(trackId)
  for (const playlist of state.musicPlaylists.values()) {
    const items = playlist.items.filter((item) => item.trackId !== trackId)
    if (items.length !== playlist.items.length) {
      state.musicPlaylists.set(playlist.id, { ...playlist, items, trackCount: items.length, updatedAt: Date.now() })
    }
  }
}

export function savePlaylist(state: DemoState, playlist: MusicPlaylistDetail): MusicPlaylistDetail {
  const next = { ...playlist, trackCount: playlist.items.length, updatedAt: Date.now() }
  state.musicPlaylists.set(next.id, next)
  return next
}

export function parseByteRange(header: string | null, size: number): { offset: number; length: number } | 'full' | 'invalid' {
  if (!header) return 'full'
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return 'invalid'
    const length = Math.min(suffix, size)
    return { offset: size - length, length }
  }
  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return 'invalid'
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (!Number.isSafeInteger(end) || end < start) return 'invalid'
  return { offset: start, length: end - start + 1 }
}
