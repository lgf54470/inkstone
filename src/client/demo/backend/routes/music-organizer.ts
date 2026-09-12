import { Hono, type Context } from 'hono'
import type { MusicPlaylistDetail, MusicTag } from '@shared/types'
import type { DemoState } from '../../state'
import { apiError, jsonBody } from '../helpers/info'
import { makePlaylist, makePlaylistItem, makeTag, savePlaylist } from '../helpers/music'

function listTagsHandler(c: Context, state: DemoState): Response {
  return c.json({ tags: [...state.musicTags.values()].sort((left, right) => left.name.localeCompare(right.name)) })
}

async function createTagHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError(400, 'bad_request', 'Tag name is required')
  if ([...state.musicTags.values()].some((tag) => tag.name === name)) {
    return apiError(409, 'conflict', 'A tag with this name already exists')
  }
  const parentId = typeof body.parentId === 'string' ? body.parentId : null
  if (parentId && !state.musicTags.has(parentId)) return apiError(400, 'bad_request', 'The parent tag does not exist')
  const tag = makeTag(name, typeof body.color === 'string' ? body.color : null, parentId)
  state.musicTags.set(tag.id, tag)
  return c.json(tag, 201)
}

async function patchTagHandler(c: Context, state: DemoState): Promise<Response> {
  const existing = state.musicTags.get(c.req.param('id') ?? '')
  if (!existing) return apiError(404, 'not_found', 'Tag not found')
  const body = await jsonBody(c.req.raw)
  if (typeof body.parentId === 'string' && isDescendant(state, existing.id, body.parentId)) {
    return apiError(400, 'bad_request', 'Tag nesting would create a cycle')
  }
  const next: MusicTag = {
    ...existing,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
    color: typeof body.color === 'string' || body.color === null ? body.color : existing.color,
    parentId: typeof body.parentId === 'string' || body.parentId === null ? body.parentId : existing.parentId,
    isPinned: typeof body.isPinned === 'boolean' ? body.isPinned : existing.isPinned,
  }
  state.musicTags.set(next.id, next)
  return c.json(next)
}

function isDescendant(state: DemoState, tagId: string, candidate: string): boolean {
  let cursor: string | null = candidate
  let depth = 0
  while (cursor && depth < 64) {
    if (cursor === tagId) return true
    cursor = state.musicTags.get(cursor)?.parentId ?? null
    depth += 1
  }
  return false
}

function deleteTagHandler(c: Context, state: DemoState): Response {
  const id = c.req.param('id') ?? ''
  const existing = state.musicTags.get(id)
  if (!existing) return apiError(404, 'not_found', 'Tag not found')
  for (const tag of state.musicTags.values()) {
    if (tag.parentId === id) state.musicTags.set(tag.id, { ...tag, parentId: existing.parentId })
  }
  state.musicTags.delete(id)
  for (const entry of state.musicTracks.values()) {
    if (!entry.track.tagIds.includes(id)) continue
    state.musicTracks.set(entry.track.id, { track: { ...entry.track, tagIds: entry.track.tagIds.filter((tagId) => tagId !== id) }, file: entry.file })
  }
  return c.json({ ok: true as const })
}

function listPlaylistsHandler(c: Context, state: DemoState): Response {
  return c.json({ playlists: [...state.musicPlaylists.values()] })
}

async function createPlaylistHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError(400, 'bad_request', 'Playlist name is required')
  const playlist = makePlaylist(name, typeof body.description === 'string' ? body.description : '')
  playlist.sortOrder = state.musicPlaylists.size
  state.musicPlaylists.set(playlist.id, playlist)
  return c.json(playlist, 201)
}

async function patchPlaylistHandler(c: Context, state: DemoState): Promise<Response> {
  const existing = state.musicPlaylists.get(c.req.param('id') ?? '')
  if (!existing) return apiError(404, 'not_found', 'Playlist not found')
  const body = await jsonBody(c.req.raw)
  const next: MusicPlaylistDetail = {
    ...existing,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
    description: typeof body.description === 'string' ? body.description : existing.description,
    isPinned: typeof body.isPinned === 'boolean' ? body.isPinned : existing.isPinned,
    isFavorite: typeof body.isFavorite === 'boolean' ? body.isFavorite : existing.isFavorite,
  }
  return c.json(savePlaylist(state, next))
}

function deletePlaylistHandler(c: Context, state: DemoState): Response {
  const id = c.req.param('id') ?? ''
  if (!state.musicPlaylists.delete(id)) return apiError(404, 'not_found', 'Playlist not found')
  return c.json({ ok: true as const })
}

async function addItemHandler(c: Context, state: DemoState): Promise<Response> {
  const playlist = state.musicPlaylists.get(c.req.param('id') ?? '')
  if (!playlist) return apiError(404, 'not_found', 'Playlist not found')
  const body = await jsonBody(c.req.raw)
  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  if (!state.musicTracks.has(trackId)) return apiError(400, 'bad_request', 'The track does not exist')
  if (playlist.items.some((item) => item.trackId === trackId)) return c.json({ id: '', added: false })
  const item = makePlaylistItem(playlist.id, trackId, playlist.items.length)
  savePlaylist(state, { ...playlist, items: [...playlist.items, item] })
  return c.json({ id: item.id, added: true }, 201)
}

async function reorderItemsHandler(c: Context, state: DemoState): Promise<Response> {
  const playlist = state.musicPlaylists.get(c.req.param('id') ?? '')
  if (!playlist) return apiError(404, 'not_found', 'Playlist not found')
  const body = await jsonBody(c.req.raw)
  const requested = Array.isArray(body.itemIds) ? body.itemIds.filter((id): id is string => typeof id === 'string') : []
  const listed = requested.map((id) => playlist.items.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item))
  const remainder = playlist.items.filter((item) => !listed.some((entry) => entry.id === item.id))
  const items = [...listed, ...remainder].map((item, index) => ({ ...item, sortOrder: index }))
  return c.json(savePlaylist(state, { ...playlist, items }))
}

function removeItemHandler(c: Context, state: DemoState): Response {
  const playlist = state.musicPlaylists.get(c.req.param('id') ?? '')
  if (!playlist) return apiError(404, 'not_found', 'Playlist not found')
  const itemId = c.req.param('itemId') ?? ''
  if (!playlist.items.some((item) => item.id === itemId)) return apiError(404, 'not_found', 'The playlist item does not exist')
  savePlaylist(state, { ...playlist, items: playlist.items.filter((item) => item.id !== itemId) })
  return c.json({ ok: true as const })
}

export function registerMusicOrganizerRoutes(app: Hono, state: DemoState): void {
  app.get('/api/music/tags', (c) => listTagsHandler(c, state))
  app.post('/api/music/tags', (c) => createTagHandler(c, state))
  app.patch('/api/music/tags/:id', (c) => patchTagHandler(c, state))
  app.delete('/api/music/tags/:id', (c) => deleteTagHandler(c, state))
  app.get('/api/music/playlists', (c) => listPlaylistsHandler(c, state))
  app.post('/api/music/playlists', (c) => createPlaylistHandler(c, state))
  app.patch('/api/music/playlists/:id', (c) => patchPlaylistHandler(c, state))
  app.delete('/api/music/playlists/:id', (c) => deletePlaylistHandler(c, state))
  app.post('/api/music/playlists/:id/items', (c) => addItemHandler(c, state))
  app.patch('/api/music/playlists/:id/items', (c) => reorderItemsHandler(c, state))
  app.delete('/api/music/playlists/:id/items/:itemId', (c) => removeItemHandler(c, state))
}
