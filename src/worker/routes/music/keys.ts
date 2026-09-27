import { LIMITS, MUSIC_SERVER_KINDS, type MusicServerKind } from '@shared/constants'
import type { MusicFormat } from '@shared/types'

const FORMAT_MIME: Record<MusicFormat, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

const EXTENSION_FORMAT: Record<string, MusicFormat> = {
  mp3: 'mp3',
  m4a: 'm4a',
  // .mov and .m4v say video on their own; .mp4 and .webm carry either kind, so an
  // untyped `.mp4` keeps the audio reading it always had.
  mp4: 'm4a',
  flac: 'flac',
  wav: 'wav',
  wave: 'wav',
  ogg: 'ogg',
  oga: 'ogg',
  opus: 'opus',
  aac: 'aac',
  webm: 'webm',
  mov: 'mov',
  m4v: 'mp4',
}

const MIME_FORMAT: Record<string, MusicFormat> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
}

// A browser-declared video type wins over the extension, because `.mp4` and `.webm`
// are containers the user may have filled with either track kind. The stored mime is
// canonicalized here so a legacy `video/x-m4v` never reaches a <video> element as a
// type the decoder rejects.
const VIDEO_TRACK_TYPES: Record<string, { format: MusicFormat; mime: string }> = {
  'video/mp4': { format: 'mp4', mime: 'video/mp4' },
  'video/x-m4v': { format: 'mp4', mime: 'video/mp4' },
  'video/quicktime': { format: 'mov', mime: 'video/quicktime' },
  'video/webm': { format: 'webm', mime: 'video/webm' },
}

const COVER_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const COVER_DATA_URL_MAX = 400_000

const INLINE_MIME_ALLOWLIST = new Set<string>([
  ...Object.values(FORMAT_MIME),
  ...Object.values(VIDEO_TRACK_TYPES).map((entry) => entry.mime),
])

export const MUSIC_OBJECT_PREFIX = 'music/'

export const MUSIC_MAX_BYTES = LIMITS.musicTrackMaxBytes

function extensionOf(value: string): string {
  return value.includes('.') ? value.split('.').pop()!.toLowerCase() : ''
}

function normalizedMime(mime: string): string {
  return mime.toLowerCase().split(';', 1)[0]!.trim()
}

export interface MusicTrackType {
  format: MusicFormat
  mime: string
}

// One resolver for every entry point (upload, WebDAV import, row read-back), so the
// container that reaches storage, the mime the browser is served, and the format the
// UI downloads under can never disagree.
export function resolveMusicTrackType(filename: string, mime: string): MusicTrackType | null {
  const declared = normalizedMime(mime)
  const video = VIDEO_TRACK_TYPES[declared]
  if (video) return video
  const format = EXTENSION_FORMAT[extensionOf(filename)] ?? MIME_FORMAT[declared]
  return format ? { format, mime: mimeForFormat(format) } : null
}

export function mimeForFormat(format: MusicFormat): string {
  return FORMAT_MIME[format]
}

export function musicObjectKey(format: MusicFormat, id: string, createdAt: number): string {
  const day = new Date(createdAt).toISOString().slice(0, 10)
  return `${MUSIC_OBJECT_PREFIX}${day}/${id}.${format}`
}

export function isMusicObjectKey(key: string): boolean {
  return key.startsWith(MUSIC_OBJECT_PREFIX) && !key.includes('..') && key.length > MUSIC_OBJECT_PREFIX.length
}

// WebDAV paths stay relative to the user's music directory: no traversal, no
// absolute paths, no control characters, and never inside the app's own
// storage namespace (those keys would enter the local object lifecycle).
// Shared by the import request schema and the M-53b bundle restore.
export function isWebdavRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !value.split('/').some((segment) => segment === '..') &&
    !value.startsWith('/') &&
    !value.startsWith(MUSIC_OBJECT_PREFIX) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

// A stored key may only be deleted when it is exactly the object this row's
// upload would have derived; forged keys must not turn a delete into
// cross-account storage access. Key extensions are read by their own table
// because upload resolution prefers the declared mime: an audio-in-mp4 file is
// stored as `.m4a` while a video file of the same name is stored as `.mp4`.
const OBJECT_KEY_FORMAT: Record<string, MusicFormat> = { ...EXTENSION_FORMAT, mp4: 'mp4' }

export function isDerivedMusicObjectKey(id: string, createdAt: number, key: string): boolean {
  const format = OBJECT_KEY_FORMAT[extensionOf(key)]
  return format !== undefined && musicObjectKey(format, id, createdAt) === key
}

export function sanitizeCoverUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed.length <= 2048 ? trimmed : null
  if (COVER_DATA_URL_RE.test(trimmed)) return trimmed.length <= COVER_DATA_URL_MAX ? trimmed : null
  return null
}

// FB-F8: provider reference rows keep their identity in `music_tracks.object_key` as
// `gds:{source}:{songId}` — the upstream song id is what a per-play URL resolution needs, and the
// source scopes the dedupe key. The format lives here rather than beside the routes because the row
// mapping has to read it too, and the routes already import the mapping.
export const GDS_KEY_PREFIX = 'gds:'

export function gdsObjectKey(source: string, songId: string): string {
  return `${GDS_KEY_PREFIX}${source}:${songId}`
}

export function parseGdsObjectKey(objectKey: string): { source: string; songId: string } | null {
  if (!objectKey.startsWith(GDS_KEY_PREFIX)) return null
  const rest = objectKey.slice(GDS_KEY_PREFIX.length)
  const split = rest.indexOf(':')
  if (split <= 0) return null
  return { source: rest.slice(0, split), songId: rest.slice(split + 1) }
}

// FB-M16: a row imported from the reader's own music server keeps its identity the same way a
// catalogue row does, in `object_key` — but it needs three parts, because the play address is
// resolved from the reader's registration (which server, which kind of protocol) rather than from a
// fixed upstream. The kind is carried here so the row mapping can name the source without a join;
// the item id is the remainder, so an id that contains colons still round-trips.
export const SERVER_KEY_PREFIX = 'srv:'

export function serverObjectKey(kind: MusicServerKind, serverId: string, itemId: string): string {
  return `${SERVER_KEY_PREFIX}${kind}:${serverId}:${itemId}`
}

export interface MusicServerObjectKey {
  kind: MusicServerKind
  serverId: string
  itemId: string
}

export function parseServerObjectKey(objectKey: string): MusicServerObjectKey | null {
  if (!objectKey.startsWith(SERVER_KEY_PREFIX)) return null
  const rest = objectKey.slice(SERVER_KEY_PREFIX.length)
  const kindEnd = rest.indexOf(':')
  if (kindEnd <= 0) return null
  const kind = rest.slice(0, kindEnd)
  const serverEnd = rest.indexOf(':', kindEnd + 1)
  if (serverEnd <= kindEnd + 1) return null
  const serverId = rest.slice(kindEnd + 1, serverEnd)
  const itemId = rest.slice(serverEnd + 1)
  if (!itemId || !(MUSIC_SERVER_KINDS as readonly string[]).includes(kind)) return null
  return { kind: kind as MusicServerKind, serverId, itemId }
}

// Both reference families answer the same question — "which upstream song is this row" — so the row
// mapping asks it once instead of branching on the prefix a second time.
export function parseProviderReference(objectKey: string): { source: string; songId: string } | null {
  const catalogue = parseGdsObjectKey(objectKey)
  if (catalogue) return catalogue
  const server = parseServerObjectKey(objectKey)
  return server ? { source: server.kind, songId: server.itemId } : null
}

// Responses served from our origin must never carry a third-party-declared or
// legacy content type: only allowlisted audio and video mimes stream inline,
// anything else is forced to a download by the caller.
export function safeStreamMime(mime: string | null | undefined): string | null {
  if (!mime) return null
  return INLINE_MIME_ALLOWLIST.has(normalizedMime(mime)) ? normalizedMime(mime) : null
}
