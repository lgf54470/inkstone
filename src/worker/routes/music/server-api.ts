import { LIMITS, MUSIC_SERVER_KINDS, type MusicServerKind } from '@shared/constants'
import { ApiError } from '../../lib/errors'
import { fetchPublicResource, readUpstreamJson } from './outbound'

/**
 * FB-M16: the protocol half of server-type sources. Two adapter families cover the four names the
 * review listed, because a brand is not a protocol: Subsonic, Navidrome, Airsonic and Nextcloud's
 * music app all answer the Subsonic REST API, and Emby answers Jellyfin's.
 *
 * Everything here is written against the reader's own registration, so unlike the catalogue proxy
 * there is no fixed host allowlist — the address rule (`isAllowedOutboundUrl`, applied on every hop
 * by `fetchPublicResource`) is the whole guard, plus the schema's URL check at registration time.
 * That rule refuses private and loopback addresses, which is also why a LAN-only server needs a
 * reverse proxy or tunnel: the platform binding (`global_fetch_strictly_public`) would refuse it
 * anyway, so this is stated rather than worked around.
 */
export interface MusicServerTarget {
  kind: MusicServerKind
  /** Base URL as registered, without a trailing slash. */
  url: string
  username: string
  /** The decrypted password (Subsonic) or access token (Jellyfin). */
  secret: string
  /** Jellyfin's own user id, which its item search needs. Null for Subsonic. */
  upstreamUserId: string | null
}

export interface MusicServerHit {
  itemId: string
  title: string
  artist: string
  album: string
  durationMs: number | null
}

export interface MusicServerPlayTarget {
  url: string
  headers: Record<string, string>
  /** The reader registered this server, so its own scheme decides — the same reading Alist gets. */
  allowHttp: boolean
}

/**
 * What a successful registration hands back for the row to store. The credential is a *record* in the
 * vault's own vocabulary (`password` for Subsonic's stored password, `token` for Jellyfin's session
 * token) rather than a bare string, because the vault hands back only the shapes it knows; the
 * upstream user id is not a secret and goes in its own column.
 */
export interface MusicServerRegistration {
  record: Record<string, string>
  upstreamUserId: string | null
}

// The Subsonic API version this adapter speaks. `search3` needs 1.4.0 or newer; the protocol's own
// clients send a version, and a server older than this answers with its own error rather than a
// different shape.
const SUBSONIC_API_VERSION = '1.16.1'
const SUBSONIC_CLIENT = 'Inkstone'
const JELLYFIN_CLIENT = 'Inkstone'
const JELLYFIN_VERSION = '1.0'
// Jellyfin measures durations in ticks of 100ns.
const TICKS_PER_MS = 10_000

function unavailable(): ApiError {
  return new ApiError(502, 'storage_unavailable', 'The music server did not answer')
}

function refused(): ApiError {
  return ApiError.badRequest('The music server refused these credentials')
}

function allowHttpFor(url: string): boolean {
  return url.startsWith('http://')
}

/** Hex, because the Subsonic API takes the password as `p=enc:<hex>` — see `subsonicAuth` below. */
function hexOf(value: string): string {
  return [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// The Subsonic protocol offers two password forms: a salted MD5 token, or the hex-encoded password.
// WebCrypto has no MD5, and the hex form is part of the spec, so that is the one this Worker can
// produce. It also means the credential is in the URL — which is exactly why every server request is
// HTTPS (the address rule refuses plain http for a public host, and `allowHttp` only exists for a
// registered `http://` base, where the credential is already travelling in clear to its owner).
function subsonicAuth(target: MusicServerTarget): URLSearchParams {
  return new URLSearchParams({
    u: target.username,
    p: `enc:${hexOf(target.secret)}`,
    v: SUBSONIC_API_VERSION,
    c: SUBSONIC_CLIENT,
    f: 'json',
  })
}

function subsonicUrl(target: MusicServerTarget, endpoint: string, extra: Record<string, string> = {}): string {
  const query = subsonicAuth(target)
  for (const [key, value] of Object.entries(extra)) query.set(key, value)
  return `${target.url}/rest/${endpoint}.view?${query.toString()}`
}

interface SubsonicEnvelope {
  'subsonic-response'?: {
    status?: unknown
    error?: { code?: unknown; message?: unknown }
    searchResult3?: { song?: unknown }
  }
}

async function subsonicCall(target: MusicServerTarget, endpoint: string, extra?: Record<string, string>): Promise<SubsonicEnvelope['subsonic-response']> {
  const response = await fetchPublicResource(
    subsonicUrl(target, endpoint, extra),
    'application/json',
    { allowHttp: allowHttpFor(target.url) },
  )
  if (!response) throw unavailable()
  if (response.status === 401 || response.status === 403) throw refused()
  const payload = await readUpstreamJson<SubsonicEnvelope>(response, LIMITS.musicProviderBodyMaxBytes)
  const answer = payload?.['subsonic-response']
  if (!answer) throw unavailable()
  if (answer.status !== 'ok') throw refused()
  return answer
}

interface SubsonicSong {
  id?: unknown
  title?: unknown
  artist?: unknown
  album?: unknown
  duration?: unknown
}

function textOf(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

async function subsonicSearch(target: MusicServerTarget, keywords: string): Promise<MusicServerHit[]> {
  const answer = await subsonicCall(target, 'search3', {
    query: keywords,
    songCount: String(LIMITS.musicServerSearchCount),
    // Only songs are imported, so asking for artists and albums would be a shape we drop anyway.
    artistCount: '0',
    albumCount: '0',
  })
  const songs = answer?.searchResult3?.song
  if (!Array.isArray(songs)) return []
  return (songs as SubsonicSong[]).flatMap((song) => {
    const itemId = textOf(song.id)
    const title = textOf(song.title)
    if (!itemId || !title) return []
    const duration = Number(song.duration)
    return [{
      itemId,
      title,
      artist: textOf(song.artist),
      album: textOf(song.album),
      durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null,
    }]
  })
}

interface JellyfinAuthResult {
  AccessToken?: unknown
  User?: { Id?: unknown }
}

interface JellyfinItems {
  Items?: unknown
}

interface JellyfinItem {
  Id?: unknown
  Name?: unknown
  Album?: unknown
  Artists?: unknown
  RunTimeTicks?: unknown
}

function jellyfinHeaders(token?: string): Record<string, string> {
  const authorization = `MediaBrowser Client="${JELLYFIN_CLIENT}", Device="${JELLYFIN_CLIENT}", DeviceId="${JELLYFIN_CLIENT}", Version="${JELLYFIN_VERSION}"`
  const headers: Record<string, string> = { 'X-Emby-Authorization': authorization }
  if (token) headers['X-Emby-Token'] = token
  return headers
}

async function jellyfinJson<T>(
  target: MusicServerTarget,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<T | null> {
  const response = await fetchPublicResource(`${target.url}${path}`, 'application/json', {
    allowHttp: allowHttpFor(target.url),
    method: init.method,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { ...jellyfinHeaders(init.token), ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  })
  if (!response) throw unavailable()
  if (response.status === 401 || response.status === 403) throw refused()
  if (response.status >= 400) throw unavailable()
  return readUpstreamJson<T>(response, LIMITS.musicProviderBodyMaxBytes)
}

// Jellyfin answers with a bearer token per session; the row stores that token (and the user id the
// search needs) instead of the password, so the password is only ever handled during registration.
async function jellyfinAuthenticate(url: string, username: string, password: string): Promise<MusicServerRegistration> {
  const target: MusicServerTarget = { kind: 'jellyfin', url, username, secret: password, upstreamUserId: null }
  const answer = await jellyfinJson<JellyfinAuthResult>(target, '/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: username, Pw: password },
  })
  const token = textOf(answer?.AccessToken)
  const userId = textOf(answer?.User?.Id)
  if (!token || !userId) throw refused()
  return { record: { token }, upstreamUserId: userId }
}

async function jellyfinSearch(target: MusicServerTarget, keywords: string): Promise<MusicServerHit[]> {
  const query = new URLSearchParams({
    userId: target.upstreamUserId ?? '',
    searchTerm: keywords,
    IncludeItemTypes: 'Audio',
    Recursive: 'true',
    Limit: String(LIMITS.musicServerSearchCount),
  })
  const answer = await jellyfinJson<JellyfinItems>(target, `/Items?${query.toString()}`, { token: target.secret })
  const items = answer?.Items
  if (!Array.isArray(items)) return []
  return (items as JellyfinItem[]).flatMap((item) => {
    const itemId = textOf(item.Id)
    const title = textOf(item.Name)
    if (!itemId || !title) return []
    const artists = Array.isArray(item.Artists) ? item.Artists.map(textOf).filter(Boolean) : []
    const ticks = Number(item.RunTimeTicks)
    return [{
      itemId,
      title,
      artist: artists.join(', '),
      album: textOf(item.Album),
      durationMs: Number.isFinite(ticks) && ticks > 0 ? Math.round(ticks / TICKS_PER_MS) : null,
    }]
  })
}

/**
 * Verifies a registration the reader is making right now, and answers what the row should store.
 * For Subsonic that is the password itself (the protocol derives its own token per call); for
 * Jellyfin it is the session token its authenticate call hands back.
 */
export async function registerMusicServer(input: {
  kind: MusicServerKind
  url: string
  username: string
  password: string
}): Promise<MusicServerRegistration> {
  const url = input.url.replace(/\/+$/, '')
  if (input.kind === 'jellyfin') return jellyfinAuthenticate(url, input.username, input.password)
  const target: MusicServerTarget = {
    kind: 'subsonic',
    url,
    username: input.username,
    secret: input.password,
    upstreamUserId: null,
  }
  await subsonicCall(target, 'ping')
  return { record: { password: input.password }, upstreamUserId: null }
}

/** Checks the stored credential without changing it — what the settings panel's Test button asks. */
export async function probeMusicServer(target: MusicServerTarget): Promise<void> {
  if (target.kind === 'jellyfin') {
    const answer = await jellyfinJson<{ Id?: unknown }>(target, '/Users/Me', { token: target.secret })
    if (!textOf(answer?.Id)) throw refused()
    return
  }
  await subsonicCall(target, 'ping')
}

export async function searchMusicServer(target: MusicServerTarget, keywords: string): Promise<MusicServerHit[]> {
  return target.kind === 'jellyfin' ? jellyfinSearch(target, keywords) : subsonicSearch(target, keywords)
}

/**
 * The play address for one item, resolved per play rather than stored — the same lifecycle a
 * catalogue's temporary link has. Jellyfin is asked with a token header (nothing else needs it in
 * the URL, which keeps the credential out of any log line that records addresses); Subsonic's own
 * protocol wants its credentials in the query, and that is the one place this adapter cannot avoid.
 */
export function musicServerPlayTarget(target: MusicServerTarget, itemId: string): MusicServerPlayTarget {
  if (target.kind === 'jellyfin') {
    return {
      url: `${target.url}/Audio/${encodeURIComponent(itemId)}/stream?static=true`,
      headers: jellyfinHeaders(target.secret),
      allowHttp: allowHttpFor(target.url),
    }
  }
  return {
    url: subsonicUrl(target, 'stream', { id: itemId }),
    headers: {},
    allowHttp: allowHttpFor(target.url),
  }
}

export function isMusicServerKind(value: unknown): value is MusicServerKind {
  return typeof value === 'string' && (MUSIC_SERVER_KINDS as readonly string[]).includes(value)
}
