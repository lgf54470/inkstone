import type { Context, Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requestClientIp } from '../../lib/request'
import { enforceMusicPublicBudget } from './budget'
import { coverResponse } from './cover'
import { pathParam } from './params'
import { TRACK_COLUMNS } from './rows'
import type { MusicTrackRow } from './rows'
import { parseStoredMusicQueue } from './playback'
import { loadMusicPublicScope } from './settings'
import { streamTrackResponse, type StreamOwner } from './stream'

const PUBLIC_MUSIC_PATH = '/api/blog/public/music'

interface PublicTagRow {
  id: string
  name: string
  color: string | null
  parent_id: string | null
}

interface TrackTagRow {
  track_id: string
  tag_id: string
}

// Read-only projection of the owner's library for the blog player: no keys, sizes or flags.
export function registerMusicPublicRoutes(routes: Hono<AppBindings>): void {
  routes.get('/library', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'library', requestClientIp(c))
    const scope = await loadMusicPublicScope(c.env.DB)
    if (!scope) return c.json({ enabled: false, tracks: [], tags: [], queue: { ids: [], currentId: null } })
    const [tracks, tags, links, playback] = await Promise.all([
      c.env.DB.prepare(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.user_id = ?1 ORDER BY t.created_at DESC`)
        .bind(scope.userId).all<MusicTrackRow>(),
      c.env.DB.prepare('SELECT id, name, color, parent_id FROM music_tags WHERE user_id = ?1 ORDER BY sort_order ASC, name ASC')
        .bind(scope.userId).all<PublicTagRow>(),
      c.env.DB.prepare('SELECT track_id, tag_id FROM music_track_tags WHERE user_id = ?1')
        .bind(scope.userId).all<TrackTagRow>(),
      c.env.DB.prepare('SELECT queue, current_index FROM music_playback WHERE user_id = ?1')
        .bind(scope.userId).first<{ queue: string; current_index: number }>(),
    ])
    const origin = new URL(c.req.url).origin
    const byTrack = new Map<string, string[]>()
    for (const link of links.results) {
      const list = byTrack.get(link.track_id)
      if (list) list.push(link.tag_id)
      else byTrack.set(link.track_id, [link.tag_id])
    }
    return c.json({
      enabled: true,
      tracks: tracks.results.map((row) => toPublicTrack(row, origin, byTrack.get(row.id) ?? [], `${PUBLIC_MUSIC_PATH}/tracks/${row.id}`)),
      tags: tags.results.map((row) => ({ id: row.id, name: row.name, color: row.color, parentId: row.parent_id })),
      queue: toPublicQueue(playback, tracks.results),
    })
  })

  routes.get('/tracks/:id/stream', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'stream', requestClientIp(c))
    const target = await loadPublicTrack(c, pathParam(c, 'id'))
    return streamTrackResponse(c, target.row, target.owner, { download: false, cacheControl: 'public, max-age=600' })
  })

  routes.get('/tracks/:id/cover', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'cover', requestClientIp(c))
    const target = await loadPublicTrack(c, pathParam(c, 'id'))
    return coverResponse(c.env, target.row, 'public, max-age=86400')
  })

  registerSharedPlaylistRoutes(routes)
}

// Per-playlist sharing is its own opt-in (M-51): these routes answer from the
// playlist's share_slug alone, never the library-wide public toggle.
function registerSharedPlaylistRoutes(routes: Hono<AppBindings>): void {
  routes.get('/playlists/:slug', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'library', requestClientIp(c))
    const slug = pathParam(c, 'slug')
    const playlist = await c.env.DB
      .prepare('SELECT id, name, description FROM music_playlists WHERE share_slug = ?1')
      .bind(slug).first<{ id: string; name: string; description: string }>()
    if (!playlist) throw ApiError.notFound('Playlist not found')
    const tracks = await c.env.DB
      .prepare(`SELECT ${TRACK_COLUMNS} FROM music_playlist_items pi JOIN music_tracks t ON t.id = pi.track_id AND t.user_id = pi.user_id
                WHERE pi.playlist_id = ?1 ORDER BY pi.sort_order ASC, pi.created_at ASC`)
      .bind(playlist.id).all<MusicTrackRow>()
    const origin = new URL(c.req.url).origin
    return c.json({
      name: playlist.name,
      description: playlist.description,
      tracks: tracks.results.map((row) => toPublicTrack(row, origin, [], `${PUBLIC_MUSIC_PATH}/playlists/${encodeURIComponent(slug)}/tracks/${row.id}`)),
    })
  })

  routes.get('/playlists/:slug/tracks/:id/stream', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'stream', requestClientIp(c))
    const target = await loadSharedPlaylistTrack(c, pathParam(c, 'slug'), pathParam(c, 'id'))
    return streamTrackResponse(c, target.row, target.owner, { download: false, cacheControl: 'public, max-age=600' })
  })

  routes.get('/playlists/:slug/tracks/:id/cover', async (c) => {
    await enforceMusicPublicBudget(c.env.DB, 'cover', requestClientIp(c))
    const target = await loadSharedPlaylistTrack(c, pathParam(c, 'slug'), pathParam(c, 'id'))
    return coverResponse(c.env, target.row, 'public, max-age=86400')
  })
}

interface PublicQueue {
  ids: string[]
  currentId: string | null
}

// The blog mirrors the queue the owner is listening to, so ids that left the library are dropped.
function toPublicQueue(
  playback: { queue: string; current_index: number } | null,
  tracks: MusicTrackRow[],
): PublicQueue {
  if (!playback) return { ids: [], currentId: null }
  const known = new Set(tracks.map((row) => row.id))
  const ids = parseStoredMusicQueue(playback.queue).filter((id) => known.has(id))
  return { ids, currentId: ids[playback.current_index] ?? null }
}

interface PublicTrackTarget {
  row: MusicTrackRow
  owner: StreamOwner
}

async function loadPublicTrack(c: Context<AppBindings>, id: string): Promise<PublicTrackTarget> {
  const scope = await loadMusicPublicScope(c.env.DB)
  if (!scope) throw ApiError.notFound('This music library is not public')
  const row = await c.env.DB
    .prepare(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.id = ?1 AND t.user_id = ?2`)
    .bind(id, scope.userId)
    .first<MusicTrackRow>()
  if (!row) throw ApiError.notFound('Track not found')
  const owner = await loadStreamOwner(c.env.DB, scope.userId)
  return { row, owner }
}

// Membership is the authorization: the track must sit in the playlist this slug points at.
async function loadSharedPlaylistTrack(c: Context<AppBindings>, slug: string, trackId: string): Promise<PublicTrackTarget> {
  const row = await c.env.DB
    .prepare(`SELECT ${TRACK_COLUMNS}, p.user_id AS owner_id FROM music_playlists p
              JOIN music_playlist_items pi ON pi.playlist_id = p.id
              JOIN music_tracks t ON t.id = pi.track_id AND t.user_id = p.user_id
              WHERE p.share_slug = ?1 AND pi.track_id = ?2`)
    .bind(slug, trackId)
    .first<MusicTrackRow & { owner_id: string }>()
  if (!row) throw ApiError.notFound('Track not found')
  const owner = await loadStreamOwner(c.env.DB, row.owner_id)
  return { row, owner }
}

async function loadStreamOwner(db: D1Database, userId: string): Promise<StreamOwner> {
  const user = await db.prepare('SELECT settings FROM users WHERE id = ?1').bind(userId).first<{ settings: string }>()
  return { userId, settingsRaw: user?.settings ?? '{}' }
}

function toPublicTrack(row: MusicTrackRow, origin: string, tagIds: string[], path: string): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    // The kind travels because the container extension does not decide it: an .mp4 in this
    // library can be a song or a clip, and only the stored mime says which.
    mime: row.mime,
    lyric: row.lyric,
    coverUrl: row.cover_url ? `${origin}${path}/cover` : null,
    streamUrl: `${origin}${path}/stream`,
    tagIds,
    createdAt: row.created_at,
  }
}
