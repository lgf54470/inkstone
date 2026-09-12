import type { Context } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { cancelStreamBestEffort } from '../../lib/streams'
import { isMusicObjectKey } from './keys'
import { contentRangeHeader, parseByteRange } from './range'
import type { MusicTrackRow } from './rows'
import { readMusicObjectStream, requireMusicStorage } from './storage'
import { fetchMusicObject, resolveMusicWebdav } from './webdav'

export interface StreamOwner {
  userId: string
  settingsRaw: string
}

export interface StreamOptions {
  download: boolean
  cacheControl: string
}

// Shared by the authenticated library and the public blog player: only the owner and the
// cache policy differ, the range and WebDAV handling stay in one place.
export async function streamTrackResponse(
  c: Context<AppBindings>,
  row: MusicTrackRow,
  owner: StreamOwner,
  options: StreamOptions,
): Promise<Response> {
  if (row.source === 'webdav') return streamWebdavTrack(c, row, owner, options)
  if (!isMusicObjectKey(row.object_key)) throw ApiError.internal('The track storage key is invalid')

  const storage = requireMusicStorage(c.env)
  const requested = parseByteRange(c.req.header('Range'), row.size_bytes)
  if (requested.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${row.size_bytes}`, 'Accept-Ranges': 'bytes' },
    })
  }
  const range = requested.kind === 'partial' ? requested.range : null
  const object = await readMusicObjectStream(c.env, storage, row.object_key, range)
  if (!object) throw ApiError.notFound('Track data is missing')

  const headers: Record<string, string> = {
    'Content-Type': row.mime,
    'Content-Length': String(object.length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl,
    'X-Content-Type-Options': 'nosniff',
  }
  if (options.download) headers['Content-Disposition'] = attachmentDisposition(row.title)
  if (range) {
    headers['Content-Range'] = contentRangeHeader(range, row.size_bytes)
    return new Response(object.body as BodyInit, { status: 206, headers })
  }
  return new Response(object.body as BodyInit, { status: 200, headers })
}

async function streamWebdavTrack(
  c: Context<AppBindings>,
  row: MusicTrackRow,
  owner: StreamOwner,
  options: StreamOptions,
): Promise<Response> {
  const ctx = await resolveMusicWebdav(c.env, owner, owner.userId)
  const upstream = await fetchMusicObject(ctx, row.object_key, c.req.header('Range') ?? null)
  if (upstream.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (upstream.status === 404) throw ApiError.notFound('The track no longer exists on the WebDAV server')
  if (upstream.status !== 200 && upstream.status !== 206) {
    await cancelStreamBestEffort(upstream.body)
    throw new ApiError(502, 'storage_unavailable', `WebDAV playback failed: HTTP ${upstream.status}`)
  }
  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('Content-Type') ?? row.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl,
    'X-Content-Type-Options': 'nosniff',
  }
  for (const header of ['Content-Length', 'Content-Range'] as const) {
    const value = upstream.headers.get(header)
    if (value) headers[header] = value
  }
  if (!headers['Content-Range'] && row.size_bytes > 0) headers['Content-Length'] = String(row.size_bytes)
  if (options.download) headers['Content-Disposition'] = attachmentDisposition(row.title)
  return new Response(upstream.body as BodyInit, { status: upstream.status === 206 ? 206 : 200, headers })
}

function attachmentDisposition(title: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(title)}`
}
