import type { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import { chunkIds } from '@shared/chunk'
import type { MusicPlayback, MusicTrack } from '@shared/types'
import type { AppBindings } from '../../env'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { TRACK_COLUMNS, toTrack } from './rows'
import type { MusicTrackRow } from './rows'
import { savePlaybackSchema, savePositionSchema } from './schemas'

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
    // A looping client could otherwise rewrite its row as fast as requests arrive; the save rides
    // its own key so a heavy listening session cannot starve playlist and tag writes.
    await enforceMusicBudget(c.env.DB, 'playback', userId)
    const body = await readJsonValidated(c, savePlaybackSchema, JSON_BODY_LIMITS.small)
    const currentIndex = Math.min(body.currentIndex, Math.max(0, body.queue.length - 1))
    await c.env.DB.prepare(
      `INSERT INTO music_playback (user_id, queue, current_index, position_ms, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id) DO UPDATE SET queue = ?2, current_index = ?3, position_ms = ?4, updated_at = ?5`,
    ).bind(userId, JSON.stringify(body.queue), currentIndex, body.positionMs, Date.now()).run()
    return c.json({ ok: true })
  })

  // Listening re-saves the playhead every few seconds; the queue rides along only
  // when it changed. The stored queue is carried into a fresh row rather than
  // overwritten, so a position save can never land after a queue save and wipe it.
  routes.put('/playback/position', requireAuth, async (c) => {
    const userId = c.get('userId')
    await enforceMusicBudget(c.env.DB, 'playback', userId)
    const body = await readJsonValidated(c, savePositionSchema, JSON_BODY_LIMITS.small)
    await c.env.DB.prepare(
      `INSERT INTO music_playback (user_id, queue, current_index, position_ms, updated_at)
       VALUES (?1, COALESCE((SELECT queue FROM music_playback WHERE user_id = ?1), '[]'), ?2, ?3, ?4)
       ON CONFLICT(user_id) DO UPDATE SET current_index = ?2, position_ms = ?3, updated_at = ?4`,
    ).bind(userId, body.currentIndex, body.positionMs, Date.now()).run()
    return c.json({ ok: true })
  })
}

async function loadQueueTracks(db: D1Database, userId: string, queue: string[]): Promise<MusicTrack[]> {
  if (!queue.length) return []
  // One batch keeps even a full 500-track queue at a single round trip; awaiting each
  // chunk serially used to cost the whole queue's latency.
  const results = await db.batch(chunkIds(queue, LIMITS.musicSqlIdChunkMax).map((chunk) => {
    const placeholders = chunk.map((_id, index) => '?' + (index + 2)).join(', ')
    return db.prepare(
      `SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.user_id = ?1 AND t.id IN (${placeholders})`,
    ).bind(userId, ...chunk)
  }))
  const byId = new Map<string, MusicTrack>()
  for (const result of results) {
    for (const row of (result.results ?? []) as MusicTrackRow[]) byId.set(row.id, toTrack(row, []))
  }
  return queue.map((id) => byId.get(id)).filter((track): track is MusicTrack => Boolean(track))
}

