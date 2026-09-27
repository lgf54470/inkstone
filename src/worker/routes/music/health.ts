import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import type { MusicReferenceHealthResult, MusicReferenceHealthStatus } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { readJsonValidated } from '../../lib/request'
import { cancelStreamBestEffort } from '../../lib/streams'
import { requireAuth } from '../../middleware/auth'
import { alistApi, joinAlistPath, parseAlistObjectKey, resolveAlistServer } from './alist'
import { parseGdsObjectKey } from './keys'
import type { MusicTrackRow } from './rows'
import { resolveProviderPlayUrl } from './provider'
import { fetchMusicUpstream } from './upstream'

// FB-F9: reference rows point at somebody else's server, so they rot silently — the library only
// finds out when the reader presses play. A scan asks each one for a single byte and reports what
// came back. The batch is capped so one press cannot become an unbounded burst at third-party hosts,
// and it is walked a row at a time: a scan is already a lot of requests, and spreading them keeps any
// single upstream from seeing a spike.
const referenceHealthSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(LIMITS.musicReferenceHealthMaxTracks),
})

export function registerMusicHealthRoutes(routes: Hono<AppBindings>): void {
  routes.post('/tracks/reference-health', requireAuth, (c) => referenceHealth(c))
}

async function referenceHealth(c: Context<AppBindings>): Promise<Response> {
  const body = await readJsonValidated(c, referenceHealthSchema, 8192)
  const ids = [...new Set(body.ids)].slice(0, LIMITS.musicReferenceHealthMaxTracks)
  if (!ids.length) return c.json({ results: [] })
  // The answer mirrors the question: one verdict per id the caller asked about, in the order it asked.
  // A row that is no longer in the library simply has no verdict here.
  const rows = await selectReferenceRows(c.env, c.get('userId'), ids)
  const byId = new Map(rows.map((row) => [row.id, row]))
  const results: MusicReferenceHealthResult[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row) results.push({ id, status: await probeReference(c, row) })
  }
  return c.json({ results })
}

// Only the three sources that are somebody else's address; R2 and WebDAV rows are ours and are not
// what goes stale without a word.
async function selectReferenceRows(env: AppBindings['Bindings'], userId: string, ids: string[]): Promise<MusicTrackRow[]> {
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(', ')
  const query = await env.DB.prepare(
    `SELECT * FROM music_tracks
      WHERE user_id = ?1 AND source IN ('external', 'alist', 'provider') AND id IN (${placeholders})`,
  ).bind(userId, ...ids).all<MusicTrackRow>()
  return query.results ?? []
}

// What each answer means for the reader: `dead` is a link that will not come back on its own (the
// host says it is gone, or the address may not be fetched at all), `unreachable` is everything else —
// a timeout, a 5xx, a server that is simply down — which a later scan may well find healthy.
async function probeReference(c: Context<AppBindings>, row: MusicTrackRow): Promise<MusicReferenceHealthStatus> {
  if (row.source === 'external') return probeUrl(row.object_key)
  if (row.source === 'provider') return probeProvider(row)
  return probeAlist(c, row)
}

async function probeProvider(row: MusicTrackRow): Promise<MusicReferenceHealthStatus> {
  const key = parseGdsObjectKey(row.object_key)
  if (!key) return 'dead'
  try {
    return await probeUrl(await resolveProviderPlayUrl(key.source, key.songId))
  } catch (error) {
    // The catalogue would not answer about this row at all — nothing to play until it does.
    return transient(error) ? 'unreachable' : 'dead'
  }
}

async function probeAlist(c: Context<AppBindings>, row: MusicTrackRow): Promise<MusicReferenceHealthStatus> {
  const key = parseAlistObjectKey(row.object_key)
  if (!key) return 'dead'
  try {
    const server = await resolveAlistServer(c.env, c.get('userId'), key.serverId)
    const data = await alistApi(server, '/api/fs/get', { path: joinAlistPath(server.rootPath, key.path) }) as { raw_url?: string }
    if (!data.raw_url) return 'dead'
    return await probeUrl(data.raw_url)
  } catch (error) {
    return transient(error) ? 'unreachable' : 'dead'
  }
}

async function probeUrl(rawUrl: string): Promise<MusicReferenceHealthStatus> {
  let response: Response
  try {
    response = await fetchMusicUpstream(rawUrl, { headers: { Range: 'bytes=0-0' }, allowHttp: true })
  } catch (error) {
    // A refusal from the address rule means the row can never be fetched again; anything else is a
    // host we could not reach this time.
    return error instanceof ApiError && error.message.includes('address') ? 'dead' : 'unreachable'
  }
  await cancelStreamBestEffort(response.body)
  // 401/403 are in here with 404/410: a signed link that no longer authorizes is as unusable as one
  // that is gone, and re-pointing the row is the same fix for both.
  if (DEAD_STATUSES.has(response.status)) return 'dead'
  return response.ok ? 'ok' : 'unreachable'
}

const DEAD_STATUSES = new Set([401, 403, 404, 410])

function transient(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500
}
