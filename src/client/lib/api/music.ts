import { CLIENT_HEADER, type MusicProviderQuality } from '@shared/constants'
import type {
  MusicLibrary,
  MusicLyricSearch,
  MusicPlayback,
  MusicPlaybackInput,
  MusicPlaybackPositionInput,
  MusicPlaylistDetail,
  MusicReferenceHealthResult,
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

export type MusicBatchAction = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'delete' | 'tag' | 'forget'

export interface MusicPlaylistPatch {
  name?: string
  description?: string
  isPinned?: boolean
  isFavorite?: boolean
  sortOrder?: number
  coverDataUrl?: string | null
}

export interface MusicUploadResult {
  track: MusicTrack | null
  error: string | null
}

export interface PublicPlaylistTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  mime: string
  lyric: string | null
  coverUrl: string | null
  streamUrl: string
  tagIds: string[]
  createdAt: number
}

export interface PublicPlaylist {
  name: string
  description: string
  coverUrl: string | null
  tracks: PublicPlaylistTrack[]
}

export interface MusicWebdavListing {
  configured: boolean
  dir: string
  directory: string
  entries: MusicWebdavEntry[]
  truncated: boolean
  reason: string | null
}

export interface MusicWebdavImportInput {
  path: string
  title?: string
  artist?: string
  album?: string
  durationMs?: number
}

export interface MusicAlistServerView {
  id: string
  name: string
  url: string
  rootPath: string
}

export interface MusicAlistCreateInput {
  name: string
  url: string
  rootPath?: string
  token: string
}

export interface MusicAlistPatchInput {
  name?: string
  url?: string
  rootPath?: string
  token?: string
}

export interface MusicAlistEntry {
  name: string
  isDir: boolean
  size: number
  path: string
}

export interface MusicAlistImportInput {
  path: string
  title?: string
  artist?: string
}

export interface MusicPodcastFeedView {
  id: string
  title: string
  url: string
  description: string
  createdAt: number
  updatedAt: number
}

export interface MusicPodcastCreateInput {
  url: string
  title?: string
}

export interface MusicPodcastPatchInput {
  title?: string
  url?: string
}

export interface MusicPodcastEpisode {
  title: string
  audioUrl: string
  sizeBytes: number
  durationSeconds: number
  publishedAt: number | null
  description: string
}

export interface MusicProviderTrack {
  provider: string
  source: string
  sourceId: string
  title: string
  artist: string
  album: string
  durationMs: number | null
  /** FB-F5: the artwork and lyric ids from the same hit; the feature-side type mirrors this. */
  coverId: string | null
  lyricId: string | null
}

export interface MusicProviderTrackImportInput {
  source: string
  sourceId: string
  title: string
  artist?: string
  album?: string
  durationMs?: number
  /** FB-F5: a data URL resolved from the catalogue's own picture id at add time. */
  coverDataUrl?: string
  /** FB-F5: the lyric text fetched through the proxy at add time. */
  lyric?: string
}

export interface MusicPodcastEpisodeImportInput {
  audioUrl: string
  title?: string
  durationMs?: number
}

export interface MusicTrashEntry {
  id: string
  kind: 'track' | 'playlist'
  name: string
  deletedAt: number
}

export interface MusicImportUrlInput {
  url: string
  title?: string
  artist?: string
  album?: string
}

export const music = {
  browseWebdav: (path: string) =>
    request<MusicWebdavListing>(`/api/music/webdav${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  deleteWebdavObject: (path: string) =>
    request<{ ok: boolean }>('/api/music/webdav/object?path=' + encodeURIComponent(path), { method: 'DELETE' }),

  importWebdav: (input: MusicWebdavImportInput) =>
    request<MusicTrack>('/api/music/webdav/import', { method: 'POST', body: input, timeoutMs: 30_000 }),

  listAlistServers: () => request<{ servers: MusicAlistServerView[] }>('/api/music/alist'),

  createAlistServer: (input: MusicAlistCreateInput) =>
    request<MusicAlistServerView>('/api/music/alist', { method: 'POST', body: input, timeoutMs: 30_000 }),

  patchAlistServer: (id: string, patch: MusicAlistPatchInput) =>
    request<MusicAlistServerView>(`/api/music/alist/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, timeoutMs: 30_000 }),

  deleteAlistServer: (id: string) =>
    request<{ ok: boolean }>(`/api/music/alist/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listAlistDirectory: (serverId: string, path: string) =>
    request<{ path: string; entries: MusicAlistEntry[] }>(`/api/music/alist/${encodeURIComponent(serverId)}/list?path=${encodeURIComponent(path)}`, { timeoutMs: 30_000 }),

  searchAlist: (serverId: string, keywords: string) =>
    request<{ keywords: string; entries: MusicAlistEntry[] }>(`/api/music/alist/${encodeURIComponent(serverId)}/search?keywords=${encodeURIComponent(keywords)}`, { timeoutMs: 30_000 }),

  importAlistTrack: (serverId: string, input: MusicAlistImportInput) =>
    request<MusicTrack>(`/api/music/alist/${encodeURIComponent(serverId)}/import`, { method: 'POST', body: input, timeoutMs: 30_000 }),

  listPodcastFeeds: () => request<{ feeds: MusicPodcastFeedView[] }>('/api/music/podcasts'),

  createPodcastFeed: (input: MusicPodcastCreateInput) =>
    request<MusicPodcastFeedView>('/api/music/podcasts', { method: 'POST', body: input, timeoutMs: 30_000 }),

  patchPodcastFeed: (id: string, patch: MusicPodcastPatchInput) =>
    request<MusicPodcastFeedView>(`/api/music/podcasts/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, timeoutMs: 30_000 }),

  deletePodcastFeed: (id: string) =>
    request<{ ok: boolean }>(`/api/music/podcasts/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: 30_000 }),

  listPodcastEpisodes: (feedId: string) =>
    request<{ feedId: string; title: string; cached: boolean; episodes: MusicPodcastEpisode[] }>(`/api/music/podcasts/${encodeURIComponent(feedId)}/episodes`, { timeoutMs: 30_000 }),

  importPodcastEpisode: (feedId: string, input: MusicPodcastEpisodeImportInput) =>
    request<MusicTrack>(`/api/music/podcasts/${encodeURIComponent(feedId)}/episodes/import`, { method: 'POST', body: input, timeoutMs: 30_000 }),

  importPodcastOpml: (opml: string) =>
    request<{ created: number; skipped: number }>('/api/music/podcasts/opml', { method: 'POST', body: { opml }, timeoutMs: 30_000 }),

  exportPodcastOpml: () =>
    request<string>('/api/music/podcasts/opml'),

  providerSearch: (source: string, keywords: string) =>
    request<{ results: MusicProviderTrack[] }>(`/api/music/provider/search?source=${encodeURIComponent(source)}&keywords=${encodeURIComponent(keywords)}`, { timeoutMs: 30_000 }),

  // FB-F5: one song's words, through the same proxy; an empty string means the catalogue has
  // none for this id.
  providerLyric: (source: string, id: string) =>
    request<{ lyric: string }>(`/api/music/provider/lyric?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`, { timeoutMs: 30_000 }),

  importProviderTrack: (input: MusicProviderTrackImportInput) =>
    request<MusicTrack>('/api/music/tracks/import-provider', { method: 'POST', body: input, timeoutMs: 30_000 }),

  // FB-F9: one probe per reference row — the worker fetches a single byte from each address and
  // answers what came back. The batch cap is the worker's (`LIMITS.musicReferenceHealthMaxTracks`),
  // so a caller with more rows splits them.
  checkReferenceHealth: (ids: string[]) =>
    request<{ results: MusicReferenceHealthResult[] }>('/api/music/tracks/reference-health', {
      method: 'POST', body: { ids }, timeoutMs: 120_000,
    }),

  listTrash: () => request<{ entries: MusicTrashEntry[] }>('/api/music/trash'),

  restoreTrash: (id: string) =>
    request<{ ok: boolean }>(`/api/music/trash/${encodeURIComponent(id)}/restore`, { method: 'POST', timeoutMs: 30_000 }),

  purgeTrash: (id: string) =>
    request<{ ok: boolean }>(`/api/music/trash/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: 30_000 }),

  importTrackFromUrl: (input: MusicImportUrlInput) =>
    request<MusicTrack>('/api/music/tracks/import-url', { method: 'POST', body: input, timeoutMs: 30_000 }),

  searchLyrics: (query: string) =>
    request<MusicLyricSearch>(`/api/music/lyric-search?q=${encodeURIComponent(query)}`),

  // `etag` is the validator the last answer came with; an unchanged library comes
  // back as 304 and resolves to null, sparing the client a full rebuild.
  library: (
    etag: string | null,
    onEtag?: (etag: string | null) => void,
  ) => request<MusicLibrary | null>('/api/music/library', { ifNoneMatch: etag ?? undefined, onEtag }),

  publicPlaylist: (slug: string) =>
    request<PublicPlaylist>(`/api/blog/public/music/playlists/${encodeURIComponent(slug)}`),

  publicSettings: () => request<{ enabled: boolean }>('/api/music/public-settings'),

  savePublicSettings: (enabled: boolean) =>
    request<{ enabled: boolean }>('/api/music/public-settings', { method: 'PUT', body: { enabled } }),

  playback: () => request<{ playback: MusicPlayback | null }>('/api/music/playback'),

  savePlayback: (input: MusicPlaybackInput) =>
    request<{ ok: boolean }>('/api/music/playback', { method: 'PUT', body: input }),

  // Drifting through a track only moves the playhead, so this one leaves the
  // stored queue out of the body instead of resending it every few seconds.
  savePlaybackPosition: (input: MusicPlaybackPositionInput) =>
    request<{ ok: boolean }>('/api/music/playback/position', { method: 'PUT', body: input }),

  patchTrack: (id: string, patch: MusicTrackPatch) =>
    request<MusicTrack>(`/api/music/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, timeoutMs: 30_000 }),

  trackLyric: (id: string) =>
    request<{ lyric: string | null }>(`/api/music/tracks/${encodeURIComponent(id)}/lyric`),

  // The Worker relays the catalogue request because the page's CSP forbids third party connections.
  searchTrackLyric: (id: string) =>
    request<{ lyric: string }>(`/api/music/tracks/${encodeURIComponent(id)}/lyric-lookup`),

  deleteTrack: (id: string) =>
    request<{ ok: boolean }>(`/api/music/tracks/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: 30_000 }),

  // `tag` carries the tag ids the whole selection is rewritten onto; the other actions carry none.
  batchTracks: (ids: string[], action: MusicBatchAction, tagIds?: string[]) =>
    request<{ ok: boolean; updated: number }>('/api/music/tracks/batch', {
      method: 'POST', body: { ids, action, ...(tagIds?.length ? { tagIds } : {}) }, timeoutMs: 30_000,
    }),

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

  sharePlaylist: (id: string) =>
    request<MusicPlaylistDetail>(`/api/music/playlists/${encodeURIComponent(id)}/share`, { method: 'POST', body: {} }),

  unsharePlaylist: (id: string) =>
    request<MusicPlaylistDetail>(`/api/music/playlists/${encodeURIComponent(id)}/share`, { method: 'DELETE' }),

  addPlaylistItem: (playlistId: string, trackId: string) =>
    request<{ id: string; added: boolean }>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'POST',
      body: { trackId },
    }),

  addPlaylistItems: (playlistId: string, trackIds: string[]) =>
    request<{ items: { id: string; trackId: string }[]; added: number; skipped: number }>(
      `/api/music/playlists/${encodeURIComponent(playlistId)}/items/batch`,
      { method: 'POST', body: { trackIds }, timeoutMs: 30_000 },
    ),

  removePlaylistItem: (playlistId: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),

  reorderPlaylist: (playlistId: string, itemIds: string[]) =>
    request<MusicPlaylistDetail>(`/api/music/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: 'PATCH',
      body: { itemIds },
      timeoutMs: 30_000,
    }),
}

// FB-F7: the quality tier only means something to the online proxy, so the parameter is
// optional and only the provider play path passes it.
export function musicStreamUrl(trackId: string, quality?: MusicProviderQuality): string {
  const base = `/api/music/tracks/${encodeURIComponent(trackId)}/stream`
  return quality === undefined ? base : `${base}?quality=${quality}`
}

export function musicCoverLookupUrl(title: string, artist: string): string {
  return `/api/music/cover-lookup?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
}

// FB-F5: the catalogue's own artwork, proxied by the worker because the page may not talk to the
// third-party image host. The bytes are fetched by the feature layer and re-encoded like every
// other cover, so this is only the address.
export function musicProviderCoverUrl(source: string, coverId: string): string {
  return `/api/music/provider/cover?source=${encodeURIComponent(source)}&id=${encodeURIComponent(coverId)}`
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
  signal?: AbortSignal,
): Promise<MusicUploadResult> {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('title', meta.title)
  form.append('artist', meta.artist)
  form.append('album', meta.album)
  form.append('durationMs', String(meta.durationMs))
  if (meta.coverUrl) form.append('coverUrl', meta.coverUrl)
  if (meta.lyric) form.append('lyric', meta.lyric)
  return sendUpload('/api/music/webdav/upload', form, onProgress, signal)
}

function sendUpload(url: string, form: FormData, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<MusicUploadResult> {
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
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
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