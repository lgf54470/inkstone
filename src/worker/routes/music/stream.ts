import type { Context } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { cancelStreamBestEffort } from '../../lib/streams'
import { isMusicObjectKey, parseGdsObjectKey, safeStreamMime } from './keys'
import { isDerivedCoverKey } from './cover'
import { alignKvRangeWindow, contentRangeHeader, isWellFormedContentLength, isWellFormedContentRange, parseByteRange } from './range'
import type { MusicTrackRow } from './rows'
import { alistApi, joinAlistPath, parseAlistObjectKey, resolveAlistServer } from './alist'
import { readProviderQuality, resolveProviderPlayUrl } from './provider'
import { capStreamBytes, fetchMusicUpstream, withHeadTimeout } from './upstream'
import { buildDownloadTag } from './id3'
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
  if (row.source === 'external') return streamExternalTrack(c, row, options)
  if (row.source === 'alist') return streamAlistTrack(c, row, options)
  if (row.source === 'provider') return streamProviderTrack(c, row, options)
  if (!isMusicObjectKey(row.object_key)) throw ApiError.internal('The track storage key is invalid')

  const storage = requireMusicStorage(c.env)
  const requested = parseByteRange(c.req.header('Range'), row.size_bytes)
  if (requested.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${row.size_bytes}`, 'Accept-Ranges': 'bytes' },
    })
  }
  let range = requested.kind === 'partial' ? requested.range : null
  // On KV the served partial is a whole aligned window, so Content-Range must
  // describe that window rather than the narrower client request.
  if (range && storage === 'kv') range = alignKvRangeWindow(range, row.size_bytes)
  const object = await readMusicObjectStream(c.env, storage, row.object_key, range)
  if (!object) throw ApiError.notFound('Track data is missing')

  // FEA-D1: a full-file mp3 download gets the library's metadata prepended as an
  // ID3v2 tag. Ranged and non-mp3 responses stay byte-exact.
  if (options.download && !range && row.mime === 'audio/mpeg') {
    const tagged = await mp3DownloadResponse(c.env, row, object, options)
    if (tagged) return tagged
  }


  const safeMime = safeStreamMime(row.mime)
  // A KV value written before sizes were kept states no length of its own; the row's
  // byte count is the same number that upload stored, so it answers for it.
  const length = object.length ?? (range ? range.length : row.size_bytes)
  const headers: Record<string, string> = {
    'Content-Type': safeMime ?? 'application/octet-stream',
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl,
    'X-Content-Type-Options': 'nosniff',
  }
  if (!safeMime || options.download) headers['Content-Disposition'] = attachmentDisposition(row.title)
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
  // FB-S1: the wait for the head is bounded; the transfer is not (see `withHeadTimeout`).
  const upstream = await withHeadTimeout((signal) => fetchMusicObject(ctx, row.object_key, c.req.header('Range') ?? null, signal))
  if (upstream.status === 401) throw new ApiError(401, 'unauthenticated', 'The WebDAV credentials were rejected')
  if (upstream.status === 404) throw ApiError.notFound('The track no longer exists on the WebDAV server')
  if (upstream.status !== 200 && upstream.status !== 206) {
    await cancelStreamBestEffort(upstream.body)
    throw new ApiError(502, 'storage_unavailable', `WebDAV playback failed: HTTP ${upstream.status}`)
  }
  return streamUpstream(upstream, row, options)
}

// FEA-B3: a direct-link reference row streams through the same worker proxy as a
// WebDAV row, minus the credentials — the URL is the whole secret. The app runs
// with `global_fetch_strictly_public`, so the runtime itself refuses to route
// this user-supplied fetch at private network ranges.
async function streamExternalTrack(
  c: Context<AppBindings>,
  row: MusicTrackRow,
  options: StreamOptions,
): Promise<Response> {
  const range = c.req.header('Range')
  // FB-S3: a direct link is the reader's own address, and http is part of what such a link may be —
  // the address rule still applies in full.
  const upstream = await fetchMusicUpstream(row.object_key, { headers: range ? { Range: range } : {}, allowHttp: true })
  if (upstream.status === 404) throw ApiError.notFound('The track is no longer reachable at its source URL')
  if (upstream.status !== 200 && upstream.status !== 206) {
    await cancelStreamBestEffort(upstream.body)
    throw new ApiError(502, 'storage_unavailable', `External playback failed: HTTP ${upstream.status}`)
  }
  return streamUpstream(upstream, row, options)
}

// Shared passthrough for both remote sources: only echo the length the upstream
// declared for this very response — the stored size_bytes can drift from the
// remote file and a wrong Content-Length stalls or poisons downstream caches.
// The claims are still a third party's, so a value that is not a well-formed
// byte count is dropped rather than forwarded to the player.
function streamUpstream(upstream: Response, row: MusicTrackRow, options: StreamOptions): Response {
  const safeMime = safeStreamMime(row.mime)
  const headers: Record<string, string> = {
    'Content-Type': safeMime ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl,
    'X-Content-Type-Options': 'nosniff',
  }
  const length = upstream.headers.get('Content-Length')
  if (length && isWellFormedContentLength(length)) headers['Content-Length'] = length.trim()
  // A 200 has no partial content to describe, so a stale or injected
  // Content-Range on one is dropped instead of re-framing the response.
  const range = upstream.status === 206 ? upstream.headers.get('Content-Range') : null
  if (range && isWellFormedContentRange(range)) headers['Content-Range'] = range.trim()
  if (!safeMime || options.download) headers['Content-Disposition'] = attachmentDisposition(row.title)
  // FB-S1: one body, one count — every remote source passes through here, so the runaway guard is
  // applied once instead of once per source.
  return new Response(capStreamBytes(upstream.body, LIMITS.musicStreamMaxBytes) as BodyInit, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  })
}

async function mp3DownloadResponse(
  env: AppBindings['Bindings'],
  row: MusicTrackRow,
  object: { body: unknown; length: number | null },
  options: StreamOptions,
): Promise<Response | null> {
  const tag = await buildDownloadTag(env, {
    title: row.title,
    artist: row.artist,
    album: row.album,
    lyric: row.lyric,
    coverKey: isDerivedCoverKey(row.id, row.created_at, row.cover_url) ? row.cover_url : null,
  })
  if (!tag) return null
  const length = (object.length ?? row.size_bytes) + tag.length
  return new Response(prependStream(tag, object.body as ReadableStream), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': options.cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': attachmentDisposition(row.title),
    },
  })
}

// FEA-A3-2: an Alist reference row resolves its server from the key, asks the
// upstream for a fresh signed link (fs/get) and proxies that — the signed URL may
// expire, so it is fetched per stream, never stored.
async function streamAlistTrack(
  c: Context<AppBindings>,
  row: MusicTrackRow,
  options: StreamOptions,
): Promise<Response> {
  const key = parseAlistObjectKey(row.object_key)
  if (!key) throw ApiError.internal('The Alist track key is invalid')
  const server = await resolveAlistServer(c.env, c.get('userId'), key.serverId)
  const data = await alistApi(server, '/api/fs/get', { path: joinAlistPath(server.rootPath, key.path) }) as { raw_url?: string }
  const rawUrl = data.raw_url
  if (!rawUrl) throw ApiError.notFound('The track is no longer reachable on the Alist server')
  const range = c.req.header('Range')
  // FB-S3: the signed link is the Alist server's own answer, checked like every other address.
  const upstream = await fetchMusicUpstream(rawUrl, { headers: range ? { Range: range } : {}, allowHttp: true })
  if (upstream.status === 404) throw ApiError.notFound('The track is no longer reachable on the Alist server')
  if (upstream.status !== 200 && upstream.status !== 206) {
    await cancelStreamBestEffort(upstream.body)
    throw new ApiError(502, 'storage_unavailable', `Alist playback failed: HTTP ${upstream.status}`)
  }
  return streamUpstream(upstream, row, options)
}

// FEA-A1-3: a provider reference row resolves its upstream link per stream —
// the aggregate hands out expiring URLs, so nothing playable is ever stored.
async function streamProviderTrack(
  c: Context<AppBindings>,
  row: MusicTrackRow,
  options: StreamOptions,
): Promise<Response> {
  const key = parseGdsObjectKey(row.object_key)
  if (!key) throw ApiError.internal('The provider track key is invalid')
  // FB-F7: the media element carries the chosen tier as a query parameter, so this is where
  // the preference reaches the resolver. The whitelist check throws for anything else.
  const playUrl = await resolveProviderPlayUrl(key.source, key.songId, readProviderQuality(c.req.query('quality')))
  const range = c.req.header('Range')
  // FB-S3: the aggregate hands out the playable address, so it is a third party's choice too.
  const upstream = await fetchMusicUpstream(playUrl, { headers: range ? { Range: range } : {}, allowHttp: true })
  if (upstream.status === 404) throw ApiError.notFound('The track is no longer reachable on the online source')
  if (upstream.status !== 200 && upstream.status !== 206) {
    await cancelStreamBestEffort(upstream.body)
    throw new ApiError(502, 'storage_unavailable', `Online playback failed: HTTP ${upstream.status}`)
  }
  return streamUpstream(upstream, row, options)
}

// Streams the tag ahead of the stored bytes without buffering the audio: the
// object body is piped through as-is after the fixed-size prefix.
function prependStream(prefix: Uint8Array, body: ReadableStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(prefix)
      void body.pipeTo(new WritableStream({
        write(chunk) { controller.enqueue(chunk) },
        close() { controller.close() },
        abort(reason) { controller.error(reason) },
      })).catch((error: unknown) => controller.error(error))
    },
  })
}

function attachmentDisposition(title: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(title)}`
}
