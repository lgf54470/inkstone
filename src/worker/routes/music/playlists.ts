import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import { chunkIds } from '@shared/chunk'
import type { MusicPlaylistDetail } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId, newSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { toPlaylist, toPlaylistItem } from './rows'
import type { MusicPlaylistItemRow, MusicPlaylistRow } from './rows'
import { batchPlaylistItemsSchema, createPlaylistSchema, patchPlaylistSchema, playlistItemSchema, reorderPlaylistSchema } from './schemas'
import { pathParam } from './params'

const PLAYLIST_SELECT = 'id, name, description, is_pinned, is_favorite, share_slug, sort_order, created_at, updated_at'

export function registerMusicPlaylistRoutes(routes: Hono<AppBindings>): void {
  routes.get('/playlists', requireAuth, (c) => listPlaylists(c))
  routes.post('/playlists', requireAuth, (c) => createPlaylist(c))
  routes.patch('/playlists/:id', requireAuth, (c) => patchPlaylist(c))
  routes.delete('/playlists/:id', requireAuth, (c) => deletePlaylist(c))
  routes.post('/playlists/:id/share', requireAuth, (c) => sharePlaylist(c))
  routes.delete('/playlists/:id/share', requireAuth, (c) => unsharePlaylist(c))
  routes.post('/playlists/:id/items', requireAuth, (c) => addItem(c))
  routes.post('/playlists/:id/items/batch', requireAuth, (c) => addItems(c))
  routes.patch('/playlists/:id/items', requireAuth, (c) => reorderItems(c))
  routes.delete('/playlists/:id/items/:itemId', requireAuth, (c) => removeItem(c))
}

async function listPlaylists(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const [playlists, items] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ${PLAYLIST_SELECT} FROM music_playlists WHERE user_id = ?1 ORDER BY is_pinned DESC, sort_order ASC, created_at ASC`,
    ).bind(userId).all<MusicPlaylistRow>(),
    c.env.DB.prepare(
      'SELECT id, playlist_id, track_id, sort_order FROM music_playlist_items WHERE user_id = ?1 ORDER BY sort_order ASC, created_at ASC',
    ).bind(userId).all<MusicPlaylistItemRow>(),
  ])
  const grouped = new Map<string, MusicPlaylistItemRow[]>()
  for (const item of items.results) {
    const list = grouped.get(item.playlist_id)
    if (list) list.push(item)
    else grouped.set(item.playlist_id, [item])
  }
  const payload: MusicPlaylistDetail[] = playlists.results.map((row) =>
    toPlaylist(row, (grouped.get(row.id) ?? []).map(toPlaylistItem)),
  )
  return c.json({ playlists: payload })
}

async function createPlaylist(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, createPlaylistSchema, JSON_BODY_LIMITS.small)
  const id = newId()
  const now = Date.now()
  const order = await nextSortOrder(c.env.DB, userId)
  await c.env.DB.prepare(
    `INSERT INTO music_playlists (id, user_id, name, description, is_pinned, is_favorite, sort_order, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, ?6)`,
  ).bind(id, userId, body.name, body.description ?? '', order, now).run()
  return c.json(await loadPlaylist(c, userId, id), 201)
}

async function patchPlaylist(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await playlistExists(c.env.DB, userId, id))) throw ApiError.notFound('Playlist not found')
  const body = await readJsonValidated(c, patchPlaylistSchema, JSON_BODY_LIMITS.small)
  await updatePlaylistRow(c.env.DB, userId, id, body)
  return c.json(await loadPlaylist(c, userId, id))
}

async function deletePlaylist(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await playlistExists(c.env.DB, userId, id))) throw ApiError.notFound('Playlist not found')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2').bind(userId, id),
    c.env.DB.prepare('DELETE FROM music_playlists WHERE user_id = ?1 AND id = ?2').bind(userId, id),
  ])
  return c.json({ ok: true })
}

async function sharePlaylist(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await c.env.DB.prepare('SELECT share_slug FROM music_playlists WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id).first<{ share_slug: string | null }>()
  if (!row) throw ApiError.notFound('Playlist not found')
  // Idempotent: re-sharing keeps the link already handed out stable.
  if (!row.share_slug) {
    await c.env.DB.prepare('UPDATE music_playlists SET share_slug = ?1, updated_at = ?2 WHERE user_id = ?3 AND id = ?4')
      .bind(newSlug(), Date.now(), userId, id).run()
  }
  return c.json(await loadPlaylist(c, userId, id))
}

async function unsharePlaylist(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await playlistExists(c.env.DB, userId, id))) throw ApiError.notFound('Playlist not found')
  await c.env.DB.prepare('UPDATE music_playlists SET share_slug = NULL, updated_at = ?1 WHERE user_id = ?2 AND id = ?3')
    .bind(Date.now(), userId, id).run()
  return c.json(await loadPlaylist(c, userId, id))
}

async function addItem(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  const { trackId } = await readJsonValidated(c, playlistItemSchema, JSON_BODY_LIMITS.small)
  // Existence, ownership and the cap probe share one read round trip; the write shares another.
  const reads = await c.env.DB.batch([
    playlistSelect(c.env.DB, userId, playlistId),
    c.env.DB.prepare('SELECT id FROM music_tracks WHERE user_id = ?1 AND id = ?2').bind(userId, trackId),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2',
    ).bind(userId, playlistId),
  ])
  if (!reads[0]?.results?.length) throw ApiError.notFound('Playlist not found')
  if (!reads[1]?.results?.length) throw ApiError.badRequest('The track does not exist')
  const count = countOf(reads[2])
  if (count >= LIMITS.musicPlaylistItemsMax) throw ApiError.tooLarge('This playlist is full')
  const id = newId()
  const [inserted] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO music_playlist_items (id, user_id, playlist_id, track_id, sort_order, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(id, userId, playlistId, trackId, count, Date.now()),
    touchStatement(c.env.DB, userId, playlistId),
  ])
  return c.json({ id, added: Boolean(inserted?.meta.changes), existed: !inserted?.meta.changes }, 201)
}

// Multi-select "add to playlist": one request for the whole selection. Ids the
// user does not own or that are already inside the playlist are skipped, and the
// response says so, instead of failing the batch.
async function addItems(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  const { trackIds } = await readJsonValidated(c, batchPlaylistItemsSchema, JSON_BODY_LIMITS.profile)
  const wanted = [...new Set(trackIds)]
  const reads = await c.env.DB.batch([
    playlistSelect(c.env.DB, userId, playlistId),
    c.env.DB.prepare(
      'SELECT track_id FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2',
    ).bind(userId, playlistId),
    ...chunkIds(wanted, LIMITS.musicSqlIdChunkMax).map((chunk) => c.env.DB.prepare(
      `SELECT id FROM music_tracks WHERE user_id = ?1 AND id IN (${chunk.map((_, index) => `?${index + 2}`).join(', ')})`,
    ).bind(userId, ...chunk)),
  ])
  if (!reads[0]?.results?.length) throw ApiError.notFound('Playlist not found')
  const existing = new Set(columnOf(reads[1], 'track_id'))
  const owned = new Set(reads.slice(2).flatMap((result) => columnOf(result, 'id')))
  const toInsert = wanted.filter((trackId) => owned.has(trackId) && !existing.has(trackId))
  if (existing.size + toInsert.length > LIMITS.musicPlaylistItemsMax) throw ApiError.tooLarge('This playlist is full')
  const created = toInsert.map((trackId) => ({ id: newId(), trackId }))
  if (created.length) {
    const now = Date.now()
    await c.env.DB.batch([
      ...created.map((item, index) => c.env.DB.prepare(
        `INSERT INTO music_playlist_items (id, user_id, playlist_id, track_id, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(item.id, userId, playlistId, item.trackId, existing.size + index, now)),
      touchStatement(c.env.DB, userId, playlistId),
    ])
  }
  return c.json({ items: created, added: created.length, skipped: wanted.length - created.length })
}

async function reorderItems(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  const { itemIds } = await readJsonValidated(c, reorderPlaylistSchema, JSON_BODY_LIMITS.profile)
  const reads = await c.env.DB.batch([
    playlistSelect(c.env.DB, userId, playlistId),
    c.env.DB.prepare(
      'SELECT id FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 ORDER BY sort_order ASC, created_at ASC',
    ).bind(userId, playlistId),
  ])
  if (!reads[0]?.results?.length) throw ApiError.notFound('Playlist not found')
  const ordered = orderAfterReorder(columnOf(reads[1], 'id'), itemIds)
  await c.env.DB.batch([
    ...ordered.map((itemId, index) => c.env.DB.prepare(
      'UPDATE music_playlist_items SET sort_order = ?1 WHERE user_id = ?2 AND playlist_id = ?3 AND id = ?4',
    ).bind(index, userId, playlistId, itemId)),
    touchStatement(c.env.DB, userId, playlistId),
  ])
  return c.json(await loadPlaylist(c, userId, playlistId))
}

async function removeItem(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  const itemId = pathParam(c, 'itemId')
  const [deleted] = await c.env.DB.batch([
    c.env.DB.prepare(
      'DELETE FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 AND id = ?3',
    ).bind(userId, playlistId, itemId),
    touchStatement(c.env.DB, userId, playlistId),
  ])
  if (!deleted?.meta.changes) throw ApiError.notFound('The playlist item does not exist')
  return c.json({ ok: true })
}

function orderAfterReorder(existing: string[], requested: string[]): string[] {
  const known = new Set(existing)
  const listed = [...new Set(requested)].filter((id) => known.has(id))
  const listedSet = new Set(listed)
  return [...listed, ...existing.filter((id) => !listedSet.has(id))]
}

async function playlistExists(db: D1Database, userId: string, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM music_playlists WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id).first<{ id: string }>()
  return Boolean(row)
}

function columnOf(result: D1Result<unknown> | undefined, column: string): string[] {
  return (result?.results ?? []).map((row) => String((row as Record<string, unknown> | undefined)?.[column] ?? ''))
}

function countOf(result: D1Result<unknown> | undefined): number {
  const first = result?.results?.[0] as Record<string, unknown> | undefined
  return Number(first?.total ?? 0)
}

function playlistSelect(db: D1Database, userId: string, id: string): D1PreparedStatement {
  return db.prepare('SELECT id FROM music_playlists WHERE user_id = ?1 AND id = ?2').bind(userId, id)
}

async function nextSortOrder(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM music_playlists WHERE user_id = ?1',
  ).bind(userId).first<{ next: number }>()
  return row?.next ?? 0
}

function touchStatement(db: D1Database, userId: string, id: string): D1PreparedStatement {
  return db.prepare('UPDATE music_playlists SET updated_at = ?1 WHERE user_id = ?2 AND id = ?3')
    .bind(Date.now(), userId, id)
}

async function updatePlaylistRow(
  db: D1Database,
  userId: string,
  id: string,
  body: { name?: string; description?: string; isPinned?: boolean; isFavorite?: boolean; sortOrder?: number },
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  const push = (column: string, value: unknown): void => {
    assignments.push(`${column} = ?${values.length + 1}`)
    values.push(value)
  }
  if (body.name !== undefined) push('name', body.name)
  if (body.description !== undefined) push('description', body.description)
  if (body.isPinned !== undefined) push('is_pinned', Number(body.isPinned))
  if (body.isFavorite !== undefined) push('is_favorite', Number(body.isFavorite))
  if (body.sortOrder !== undefined) push('sort_order', body.sortOrder)
  if (!assignments.length) return
  push('updated_at', Date.now())
  values.push(userId, id)
  await db.prepare(
    `UPDATE music_playlists SET ${assignments.join(', ')} WHERE user_id = ?${values.length - 1} AND id = ?${values.length}`,
  ).bind(...values).run()
}

async function loadPlaylist(c: Context<AppBindings>, userId: string, id: string): Promise<MusicPlaylistDetail> {
  const [head, items] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT ${PLAYLIST_SELECT} FROM music_playlists WHERE user_id = ?1 AND id = ?2`)
      .bind(userId, id),
    c.env.DB.prepare(
      'SELECT id, playlist_id, track_id, sort_order FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 ORDER BY sort_order ASC, created_at ASC',
    ).bind(userId, id),
  ])
  const row = head?.results?.[0] as MusicPlaylistRow | undefined
  if (!row) throw ApiError.notFound('Playlist not found')
  return toPlaylist(row, ((items?.results ?? []) as MusicPlaylistItemRow[]).map(toPlaylistItem))
}