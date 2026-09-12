import { CLIENT_HEADER } from '@shared/constants'
import type {
  MusicLibrary,
  MusicPlayback,
  MusicPlaybackInput,
  MusicPlaylistDetail,
  MusicTag,
  MusicTrack,
  MusicWebdavEntry,
} from '@shared/types'
import { ApiError, CLIENT_ID, request } from './transport'

export interface MusicTrackPatch {
  title?: string
  artist?: string
  album?: string
  durationMs?: number
  coverUrl?: string | null
  coverDataUrl?: string | null
  lyric?: string | null
  isFavorite?: boolean
  isPinned?: boolean
  tagIds?: string[]
}

export type MusicBatchAction = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'delete'

export interface MusicPlaylistPatch {
  name?: string
  description?: string
  isPinned?: boolean
  isFavorite?: boolean
  sortOrder?: number
}

export interface MusicUploadResult {
  track: MusicTrack | null
  error: string | null
}

export interface MusicWebdavListing {
  configured: boolean
  dir: string
  directory: string
  entries: MusicWebdavEntry[]
  reason: string | null
}

export interface MusicWebdavImportInput {
  path: string
  title?: string
  artist?: string
  album?: string
  durationMs?: number
}

export const music = {
  browseWebdav: (path: string) =>
    request<MusicWebdavListing>(`/api/music/webdav${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  deleteWebdavObject: (path: string) =>
    request<{ ok: boolean }>('/api/music/webdav/object?path=' + encodeURIComponent(path), { method: 'DELETE' }),

  importWebdav: (input: MusicWebdavImportInput) =>
    request<MusicTrack>('/api/music/webdav/import', { method: 'POST', body: input, timeoutMs: 30_000 }),

  library: () => request<MusicLibrary>('/api/music/library'),

  publicSettings: () => request<{ enabled: boolean }>('/api/music/public-settings'),

  savePublicSettings: (enabled: boolean) =>
    request<{ enabled: boolean }>('/api/music/public-settings', { method: 'PUT', body: { enabled } }),

  playback: () => request<{ playback: MusicPlayback | null }>('/api/music/playback'),

  savePlayback: (input: MusicPlaybackInput) =>
    request<{ ok: boolean }>('/api/music/playback', { method: 'PUT', body: input }),

  patchTrack: (id: string, patch: MusicTrackPatch) =>
    request<MusicTrack>(`/api/music/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, timeoutMs: 30_000 }),

  deleteTrack: (id: string) =>
    request<{ ok: boolean }>(`/api/music/tracks/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: 30_000 }),

  batchTracks: (ids: string[], action: MusicBatchAction) =>
    request<{ ok: boolean; updated: number }>('/api/music/tracks/batch', { method: 'POST', body: { ids, action }, timeoutMs: 30_000 }),

  countPlay: (id: string) =>
    request<{ ok: boolean }>(`/api/music/tracks/${encodeURIComponent(id)}/play`, { method: 'POST', body: {} }),

  createTag: (input: { name: string; color?: string | null; parentId?: string | null }) =>
    request<MusicTag>('/api/music/tags', { method: 'POST', body: input }),

  patchTag: (id: string, patch: { name?: string; color?: string | null; parentId?: string | null; isPinned?: boolean; sortOrder?: number }) =>
    request<MusicTag>(`/api/music/tags/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),

  deleteTag: (id: string) =>
    request<{ ok: boolean }>(`/api/music/tags/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createPlaylist: (input: { name: string; description?: string }) =>
    request<MusicPlaylistDetail>('/api/music/playlists', { method: 'POST', body: input }),

  patchPlaylist: (id: string, patch: MusicPlaylistPatch) =>
    request<MusicPlaylistDetail>(`/api/music/playlists/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),

  deletePlaylist: (id: string) =>
    request<{ ok: boolean }>(`/api/music/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addPlaylistItem: (playlistId: string, trackId: string) =>
    request<{ id: string; added: boolean }>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'POST',
      body: { trackId },
    }),

  removePlaylistItem: (playlistId: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),

  reorderPlaylist: (playlistId: string, itemIds: string[]) =>
    request<MusicPlaylistDetail>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'PATCH',
      body: { itemIds },
      timeoutMs: 30_000,
    }),
}

export function musicStreamUrl(trackId: string): string {
  return `/api/music/tracks/${encodeURIComponent(trackId)}/stream`
}

export function musicCoverLookupUrl(title: string, artist: string): string {
  return `/api/music/cover-lookup?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
}

export function uploadMusicTrack(
  file: File,
  meta: { title: string; artist: string; album: string; durationMs: number; tagIds: string[]; coverUrl?: string | null; lyric?: string | null },
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<MusicUploadResult> {
  return new Promise((resolve) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('title', meta.title)
    form.append('artist', meta.artist)
    form.append('album', meta.album)
    form.append('durationMs', String(meta.durationMs))
    form.append('tagIds', JSON.stringify(meta.tagIds))
    if (meta.coverUrl) form.append('coverUrl', meta.coverUrl)
    if (meta.lyric) form.append('lyric', meta.lyric)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/music/tracks')
    xhr.setRequestHeader(CLIENT_HEADER, '1')
    xhr.setRequestHeader('X-Inkstone-Origin', CLIENT_ID)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => resolve(parseUploadResponse(xhr)))
    xhr.addEventListener('error', () => resolve({ track: null, error: 'network' }))
    xhr.addEventListener('abort', () => resolve({ track: null, error: 'aborted' }))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

export function uploadMusicToWebdav(
  file: File,
  meta: { title: string; artist: string; album: string; durationMs: number; coverUrl: string | null; lyric?: string | null },
  onProgress: (percent: number) => void,
): Promise<MusicUploadResult> {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('title', meta.title)
  form.append('artist', meta.artist)
  form.append('album', meta.album)
  form.append('durationMs', String(meta.durationMs))
  if (meta.coverUrl) form.append('coverUrl', meta.coverUrl)
  if (meta.lyric) form.append('lyric', meta.lyric)
  return sendUpload('/api/music/webdav/upload', form, onProgress)
}

function sendUpload(url: string, form: FormData, onProgress: (percent: number) => void): Promise<MusicUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader(CLIENT_HEADER, '1')
    xhr.setRequestHeader('X-Inkstone-Origin', CLIENT_ID)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => resolve(parseUploadResponse(xhr)))
    xhr.addEventListener('error', () => resolve({ track: null, error: 'network' }))
    xhr.addEventListener('abort', () => resolve({ track: null, error: 'aborted' }))
    xhr.send(form)
  })
}

function parseUploadResponse(xhr: XMLHttpRequest): MusicUploadResult {
  let payload: unknown = null
  try {
    payload = JSON.parse(xhr.responseText) as unknown
  } catch {
    payload = null
  }
  if (xhr.status >= 200 && xhr.status < 300 && payload) return { track: payload as MusicTrack, error: null }
  const message = (payload as { error?: { code?: string; message?: string } } | null)?.error
  return { track: null, error: message?.code ?? String(xhr.status || 0) }
}

export { ApiError }