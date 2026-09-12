import { LIMITS } from '@shared/constants'
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
}

const EXTENSION_FORMAT: Record<string, MusicFormat> = {
  mp3: 'mp3',
  m4a: 'm4a',
  mp4: 'm4a',
  flac: 'flac',
  wav: 'wav',
  wave: 'wav',
  ogg: 'ogg',
  oga: 'ogg',
  opus: 'opus',
  aac: 'aac',
  webm: 'webm',
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

const COVER_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const COVER_DATA_URL_MAX = 400_000

export const MUSIC_OBJECT_PREFIX = 'music/'

export const MUSIC_MAX_BYTES = LIMITS.musicTrackMaxBytes

export function resolveMusicFormat(filename: string, mime: string): MusicFormat | null {
  const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  const fromName = EXTENSION_FORMAT[extension]
  if (fromName) return fromName
  return MIME_FORMAT[mime.toLowerCase().split(';', 1)[0]!.trim()] ?? null
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

export function sanitizeCoverUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed.length <= 2048 ? trimmed : null
  if (COVER_DATA_URL_RE.test(trimmed)) return trimmed.length <= COVER_DATA_URL_MAX ? trimmed : null
  return null
}
