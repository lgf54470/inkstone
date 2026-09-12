import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import type { DemoState } from '../../state'
import { demoMusicLibrary, newDemoId } from '../../state'
import { apiError, jsonBody } from '../helpers/info'
import { findTrack, parseByteRange, patchTrack, removeTrackEverywhere } from '../helpers/music'

function libraryHandler(c: Context, state: DemoState): Response {
  return c.json(demoMusicLibrary(state))
}

async function createTrackHandler(c: Context, state: DemoState): Promise<Response> {
  const form = await c.req.raw.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return apiError(400, 'bad_request', 'Missing file field')
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|flac|wav|ogg|opus|aac|webm)$/i.test(file.name)) {
    return apiError(400, 'bad_request', 'Unsupported audio format')
  }
  if (file.size === 0) return apiError(400, 'bad_request', 'The audio file is empty')
  if (file.size > LIMITS.musicTrackMaxBytes) return apiError(413, 'payload_too_large', 'The audio file exceeds the limit')
  const used = [...state.musicTracks.values()].reduce((total, entry) => total + entry.track.sizeBytes, 0)
  if (used + file.size > LIMITS.musicQuotaBytes) return apiError(413, 'payload_too_large', 'The music storage quota has been reached')

  const readText = (key: string): string => {
    const value = form.get(key)
    return typeof value === 'string' ? value.trim() : ''
  }
  const now = Date.now()
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '')
  const track: MusicTrack = {
    id: newDemoId(),
    title: readText('title') || fallbackTitle,
    artist: readText('artist'),
    album: readText('album'),
    durationMs: Number(readText('durationMs')) || 0,
    source: 'r2',
    objectKey: `music/${new Date(now).toISOString().slice(0, 10)}/${newDemoId()}.mp3`,
    mime: file.type || 'audio/mpeg',
    sizeBytes: file.size,
    coverUrl: null,
    lyric: null,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  state.musicTracks.set(track.id, { track, file })
  return c.json(track, 201)
}

async function streamHandler(c: Context, state: DemoState): Promise<Response> {
  const entry = state.musicTracks.get(c.req.param('id') ?? '')
  if (!entry) return apiError(404, 'not_found', 'Track not found')
  const bytes = new Uint8Array(await entry.file.arrayBuffer())
  const range = parseByteRange(c.req.header('Range') ?? null, bytes.byteLength)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}`, 'Accept-Ranges': 'bytes' } })
  }
  const headers: Record<string, string> = {
    'Content-Type': entry.track.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  }
  if (range === 'full') {
    headers['Content-Length'] = String(bytes.byteLength)
    return new Response(bytes, { status: 200, headers })
  }
  headers['Content-Length'] = String(range.length)
  headers['Content-Range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${bytes.byteLength}`
  return new Response(bytes.subarray(range.offset, range.offset + range.length), { status: 206, headers })
}

async function patchTrackHandler(c: Context, state: DemoState): Promise<Response> {
  const track = findTrack(state, c.req.param('id') ?? '')
  if (!track) return apiError(404, 'not_found', 'Track not found')
  const body = await jsonBody(c.req.raw)
  if (!Object.keys(body).length) return apiError(400, 'bad_request', 'Provide at least one field to update')
  const next = patchTrack(state, track, body)
  state.musicTracks.set(next.id, { track: next, file: state.musicTracks.get(next.id)!.file })
  return c.json(next)
}

function deleteTrackHandler(c: Context, state: DemoState): Response {
  const id = c.req.param('id') ?? ''
  if (!state.musicTracks.has(id)) return apiError(404, 'not_found', 'Track not found')
  removeTrackEverywhere(state, id)
  return c.json({ ok: true as const })
}

function playTrackHandler(c: Context, state: DemoState): Response {
  const track = findTrack(state, c.req.param('id') ?? '')
  if (!track) return apiError(404, 'not_found', 'Track not found')
  const next = { ...track, playCount: track.playCount + 1 }
  state.musicTracks.set(next.id, { track: next, file: state.musicTracks.get(next.id)!.file })
  return c.json({ ok: true as const, counted: true })
}

async function batchTracksHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  const action = String(body.action ?? '')
  if (!ids.length) return apiError(400, 'bad_request', 'Select at least one track')
  for (const id of ids) {
    const entry = state.musicTracks.get(id)
    if (!entry) continue
    if (action === 'delete') {
      removeTrackEverywhere(state, id)
      continue
    }
    const flag = action === 'favorite' || action === 'unfavorite' ? 'isFavorite' : 'isPinned'
    const value = action === 'favorite' || action === 'pin'
    state.musicTracks.set(id, { track: { ...entry.track, [flag]: value, updatedAt: Date.now() }, file: entry.file })
  }
  return c.json({ ok: true as const, updated: ids.length })
}

export function registerMusicRoutes(app: Hono, state: DemoState): void {
  app.get('/api/music/library', (c) => libraryHandler(c, state))
  app.post('/api/music/tracks', (c) => createTrackHandler(c, state))
  app.get('/api/music/tracks/:id/stream', (c) => streamHandler(c, state))
  app.patch('/api/music/tracks/:id', (c) => patchTrackHandler(c, state))
  app.delete('/api/music/tracks/:id', (c) => deleteTrackHandler(c, state))
  app.post('/api/music/tracks/:id/play', (c) => playTrackHandler(c, state))
  app.post('/api/music/tracks/batch', (c) => batchTracksHandler(c, state))
}
