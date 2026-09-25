import type { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { fetchAllowedResource, readUpstreamJson } from './outbound'
import { pathParam } from './params'

// lrclib aggregates crowd-sourced lyrics and needs no key; the fetch goes
// through the Worker because the page's CSP forbids third party connections.
const LYRICS_ENDPOINT = 'https://lrclib.net/api/get'
const LYRICS_ALLOWED_HOSTS = ['lrclib.net']
const MAX_LYRIC_BYTES = LIMITS.musicLyricMaxBytes
// The answer carries one track's lyrics, so the cap is the stored ceiling plus room
// for the envelope around it; anything longer is not a lyrics answer we want.
const MAX_LYRIC_RESPONSE_BYTES = MAX_LYRIC_BYTES * 2

interface LyricMatch {
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

// Read-only by design: the lookup answers with the match and the caller saves
// it through the normal metadata patch, so an unasked-for fetch can never
// rewrite a track the listener has hand-edited.
export function registerMusicLyricLookupRoutes(routes: Hono<AppBindings>): void {
  routes.get('/tracks/:id/lyric-lookup', requireAuth, async (c) => {
    const track = await c.env.DB
      .prepare('SELECT title, artist, duration_ms FROM music_tracks WHERE id = ?1 AND user_id = ?2')
      .bind(pathParam(c, 'id'), c.get('userId'))
      .first<{ title: string; artist: string | null; duration_ms: number | null }>()
    if (!track) throw ApiError.notFound('Track not found')
    await enforceMusicBudget(c.env.DB, 'lyric', c.get('userId'))
    const lyric = await findLyrics(track.title, track.artist ?? '', track.duration_ms)
    if (!lyric) throw ApiError.notFound('No lyrics matched this track')
    return c.json({ lyric })
  })
}

async function findLyrics(title: string, artist: string, durationMs: number | null): Promise<string | null> {
  const trimmed = title.trim()
  if (!trimmed) return null
  const params = new URLSearchParams({ track_name: trimmed })
  if (artist.trim()) params.set('artist_name', artist.trim())
  if (durationMs && durationMs > 0) params.set('duration', String(Math.round(durationMs / 1000)))
  const response = await fetchAllowedResource(`${LYRICS_ENDPOINT}?${params}`, LYRICS_ALLOWED_HOSTS, 'application/json')
  // Upstream answers 404 for "no match"; anything else that is not an OK body
  // is the same no-match answer to the listener, and a 200 carries the text.
  if (!response || !response.ok) return null
  const match = await readUpstreamJson<LyricMatch>(response, MAX_LYRIC_RESPONSE_BYTES)
  const lyric = (match?.syncedLyrics?.trim() || match?.plainLyrics?.trim()) ?? ''
  if (!lyric || new TextEncoder().encode(lyric).byteLength > MAX_LYRIC_BYTES) return null
  return lyric
}
