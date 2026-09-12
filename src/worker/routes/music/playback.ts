import type { Hono } from 'hono'
import type { MusicPlayback, MusicTrack } from '@shared/types'
import type { AppBindings } from '../../env'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { TRACK_COLUMNS, toTrack } from './rows'
import type { MusicTrackRow } from './rows'
import { savePlaybackSchema } from './schemas'

const QUEUE_CHUNK = 50

// Shared with the public blog projection so both sides read a stored queue the same way.
export function parseStoredMusicQueue(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch (error) {
    console.warn('[inkstone] stored music queue is not readable:', error)
    return []
  }
}

export function registerMusicPlaybackRoutes(routes: Hono<AppBindings>): void {
  routes.get('/playback', requireAuth, async (c) => {
    const userId = c.get('userId')
    const row = await c.env.DB.prepare(
      'SELECT queue, current_index, position_ms FROM music_playback WHERE user_id = ?1',
    ).bind(userId).first<{ queue: string; current_index: number; position_ms: number }>()
    if (!row) return c.json({ playback: null })
    const queue = parseStoredMusicQueue(row.queue)
    const playback: MusicPlayback = {
      queue,
      currentIndex: row.current_index,
      positionMs: row.position_ms,
      tracks: await loadQueueTracks(c.env.DB, userId, queue),
    }
    return c.json({ playback })
  })

  routes.put('/playback', requireAuth, async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, savePlaybackSchema, JSON_BODY_LIMITS.small)
    const currentIndex = Math.min(body.currentIndex, Math.max(0, body.queue.length - 1))
    await c.env.DB.prepare(
      `INSERT INTO music_playback (user_id, queue, current_index, position_ms, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET queue = ?2, current_index = ?3, position_ms = ?4, updated_at = ?5`,
    ).bind(userId, JSON.stringify(body.queue), currentIndex, body.positionMs, Date.now()).run()
    return c.json({ ok: true })
  })
}

async function loadQueueTracks(db: D1Database, userId: string, queue: string[]): Promise<MusicTrack[]> {
  if (!queue.length) return []
  const byId = new Map<string, MusicTrack>()
  for (let start = 0; start < queue.length; start += QUEUE_CHUNK) {
    const chunk = queue.slice(start, start + QUEUE_CHUNK)
    const placeholders = chunk.map((_id, index) => '?' + (index + 2)).join(', ')
    const rows = await db.prepare(
      `SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.user_id = ?1 AND t.id IN (${placeholders})`,
    ).bind(userId, ...chunk).all<MusicTrackRow>()
    for (const row of rows.results) byId.set(row.id, toTrack(row, []))
  }
  return queue.map((id) => byId.get(id)).filter((track): track is MusicTrack => Boolean(track))
}
