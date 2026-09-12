import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { MusicPlaylistDetail } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { toPlaylist, toPlaylistItem } from './rows'
import type { MusicPlaylistItemRow, MusicPlaylistRow } from './rows'
import { createPlaylistSchema, patchPlaylistSchema, playlistItemSchema, reorderPlaylistSchema } from './schemas'
import { pathParam } from './params'

const PLAYLIST_SELECT = 'id, name, description, is_pinned, is_favorite, sort_order, created_at, updated_at'

export function registerMusicPlaylistRoutes(routes: Hono<AppBindings>): void {
  routes.get('/playlists', requireAuth, (c) => listPlaylists(c))
  routes.post('/playlists', requireAuth, (c) => createPlaylist(c))
  routes.patch('/playlists/:id', requireAuth, (c) => patchPlaylist(c))
  routes.delete('/playlists/:id', requireAuth, (c) => deletePlaylist(c))
  routes.post('/playlists/:id/items', requireAuth, (c) => addItem(c))
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

async function addItem(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  if (!(await playlistExists(c.env.DB, userId, playlistId))) throw ApiError.notFound('Playlist not found')
  const { trackId } = await readJsonValidated(c, playlistItemSchema, JSON_BODY_LIMITS.small)
  const owned = await c.env.DB.prepare('SELECT id FROM music_tracks WHERE user_id = ?1 AND id = ?2')
    .bind(userId, trackId).first<{ id: string }>()
  if (!owned) throw ApiError.badRequest('The track does not exist')

  const count = await countItems(c.env.DB, userId, playlistId)
  if (count >= LIMITS.musicPlaylistItemsMax) throw ApiError.tooLarge('This playlist is full')
  const id = newId()
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO music_playlist_items (id, user_id, playlist_id, track_id, sort_order, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(id, userId, playlistId, trackId, count, Date.now()).run()
  await touchPlaylist(c.env.DB, userId, playlistId)
  return c.json({ id, added: Boolean(result.meta.changes), existed: !result.meta.changes }, 201)
}

async function reorderItems(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  if (!(await playlistExists(c.env.DB, userId, playlistId))) throw ApiError.notFound('Playlist not found')
  const { itemIds } = await readJsonValidated(c, reorderPlaylistSchema, JSON_BODY_LIMITS.profile)
  const ordered = await resolveItemOrder(c.env.DB, userId, playlistId, itemIds)
  const statements = ordered.map((itemId, index) =>
    c.env.DB.prepare('UPDATE music_playlist_items SET sort_order = ?1 WHERE user_id = ?2 AND playlist_id = ?3 AND id = ?4')
      .bind(index, userId, playlistId, itemId),
  )
  if (statements.length) await c.env.DB.batch(statements)
  await touchPlaylist(c.env.DB, userId, playlistId)
  return c.json(await loadPlaylist(c, userId, playlistId))
}

async function removeItem(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const playlistId = pathParam(c, 'id')
  const itemId = pathParam(c, 'itemId')
  const result = await c.env.DB.prepare(
    'DELETE FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 AND id = ?3',
  ).bind(userId, playlistId, itemId).run()
  if (!result.meta.changes) throw ApiError.notFound('The playlist item does not exist')
  await touchPlaylist(c.env.DB, userId, playlistId)
  return c.json({ ok: true })
}

async function resolveItemOrder(db: D1Database, userId: string, playlistId: string, requested: string[]): Promise<string[]> {
  const rows = await db.prepare(
    'SELECT id FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 ORDER BY sort_order ASC, created_at ASC',
  ).bind(userId, playlistId).all<{ id: string }>()
  const existing = rows.results.map((row) => row.id)
  const known = new Set(existing)
  const listed = [...new Set(requested)].filter((id) => known.has(id))
  const remainder = existing.filter((id) => !listed.includes(id))
  return [...listed, ...remainder]
}

async function playlistExists(db: D1Database, userId: string, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM music_playlists WHERE user_id = ?1 AND id = ?2')
    .bind(userId, id).first<{ id: string }>()
  return Boolean(row)
}

async function countItems(db: D1Database, userId: string, playlistId: string): Promise<number> {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2',
  ).bind(userId, playlistId).first<{ total: number }>()
  return row?.total ?? 0
}

async function nextSortOrder(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM music_playlists WHERE user_id = ?1',
  ).bind(userId).first<{ next: number }>()
  return row?.next ?? 0
}

async function touchPlaylist(db: D1Database, userId: string, id: string): Promise<void> {
  await db.prepare('UPDATE music_playlists SET updated_at = ?1 WHERE user_id = ?2 AND id = ?3')
    .bind(Date.now(), userId, id).run()
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
  const row = await c.env.DB.prepare(`SELECT ${PLAYLIST_SELECT} FROM music_playlists WHERE user_id = ?1 AND id = ?2`)
    .bind(userId, id).first<MusicPlaylistRow>()
  if (!row) throw ApiError.notFound('Playlist not found')
  const items = await c.env.DB.prepare(
    'SELECT id, playlist_id, track_id, sort_order FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2 ORDER BY sort_order ASC, created_at ASC',
  ).bind(userId, id).all<MusicPlaylistItemRow>()
  return toPlaylist(row, items.results.map(toPlaylistItem))
}