import type { Context, Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { coverResponse } from './cover'
import { pathParam } from './params'
import { TRACK_COLUMNS } from './rows'
import type { MusicTrackRow } from './rows'
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
    const scope = await loadMusicPublicScope(c.env.DB)
    if (!scope) return c.json({ enabled: false, tracks: [], tags: [] })
    const [tracks, tags, links] = await Promise.all([
      c.env.DB.prepare(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.user_id = ?1 ORDER BY t.created_at DESC`)
        .bind(scope.userId).all<MusicTrackRow>(),
      c.env.DB.prepare('SELECT id, name, color, parent_id FROM music_tags WHERE user_id = ?1 ORDER BY sort_order ASC, name ASC')
        .bind(scope.userId).all<PublicTagRow>(),
      c.env.DB.prepare('SELECT track_id, tag_id FROM music_track_tags WHERE user_id = ?1')
        .bind(scope.userId).all<TrackTagRow>(),
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
      tracks: tracks.results.map((row) => toPublicTrack(row, origin, byTrack.get(row.id) ?? [])),
      tags: tags.results.map((row) => ({ id: row.id, name: row.name, color: row.color, parentId: row.parent_id })),
    })
  })

  routes.get('/tracks/:id/stream', async (c) => {
    const target = await loadPublicTrack(c, pathParam(c, 'id'))
    return streamTrackResponse(c, target.row, target.owner, { download: false, cacheControl: 'public, max-age=600' })
  })

  routes.get('/tracks/:id/cover', async (c) => {
    const target = await loadPublicTrack(c, pathParam(c, 'id'))
    return coverResponse(c.env, target.row, 'public, max-age=86400')
  })
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
  const owner = await c.env.DB.prepare('SELECT settings FROM users WHERE id = ?1').bind(scope.userId).first<{ settings: string }>()
  return { row, owner: { userId: scope.userId, settingsRaw: owner?.settings ?? '{}' } }
}

function toPublicTrack(row: MusicTrackRow, origin: string, tagIds: string[]): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    lyric: row.lyric,
    coverUrl: row.cover_url ? `${origin}${PUBLIC_MUSIC_PATH}/tracks/${row.id}/cover` : null,
    streamUrl: `${origin}${PUBLIC_MUSIC_PATH}/tracks/${row.id}/stream`,
    tagIds,
    createdAt: row.created_at,
  }
}
