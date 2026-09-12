import type { AppBindings } from '../../env'
import type { Env } from '../../env'
import { ApiError } from '../../lib/errors'
import { MUSIC_OBJECT_PREFIX } from './keys'
import { putMusicObject, requireMusicStorage } from './storage'
import type { AttachmentObjectStorage } from '../../attachments/keys'

const COVER_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/
const COVER_MAX_BYTES = 512 * 1024

export function coverHeaders(mime: string): Record<string, string> {
  return {
    'Content-Type': mime,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  }
}

export interface StoredCover {
  key: string
  bytes: Uint8Array
  mime: string
}

// Shared by uploads and metadata refreshes; a failed cover write must not fail the caller.
export async function storeCoverObject(
  env: AppBindings['Bindings'],
  trackId: string,
  createdAt: number,
  dataUrl: string | null,
): Promise<string | null> {
  const decoded = decodeCoverDataUrl(dataUrl)
  if (!decoded) return null
  const key = coverObjectKey(trackId, createdAt, decoded.mime)
  try {
    await putMusicObject(env, requireMusicStorage(env), key, decoded.bytes, decoded.mime)
    return key
  } catch (error) {
    console.warn('[inkstone] music cover write failed:', error)
    return null
  }
}

export function coverObjectKey(trackId: string, createdAt: number, mime: string): string {
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  return `${MUSIC_OBJECT_PREFIX}cover/${new Date(createdAt).toISOString().slice(0, 10)}/${trackId}.${extension}`
}

export function decodeCoverDataUrl(value: string | null): StoredCover | null {
  const match = value ? COVER_DATA_URL_RE.exec(value.trim()) : null
  if (!match) return null
  const mime = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`
  const bytes = base64ToBytes(match[2]!)
  return bytes && bytes.byteLength <= COVER_MAX_BYTES ? { key: '', bytes, mime } : null
}

function base64ToBytes(payload: string): Uint8Array | null {
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch (error) {
    console.warn('[inkstone] music cover payload is not valid base64:', error)
    return null
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function isCoverObjectKey(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(`${MUSIC_OBJECT_PREFIX}cover/`))
}

export function coverMimeFor(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

export async function readCoverBytes(
  env: Env,
  storage: AttachmentObjectStorage,
  key: string,
): Promise<Uint8Array | null> {
  if (storage === 'r2') {
    if (!env.FILES) throw new ApiError(503, 'storage_unavailable', 'R2 storage is not bound')
    const object = await env.FILES.get(key)
    return object ? new Uint8Array(await object.arrayBuffer()) : null
  }
  if (!env.FILES_KV) throw new ApiError(503, 'storage_unavailable', 'KV storage is not bound')
  const value = await env.FILES_KV.get(key, 'arrayBuffer')
  return value ? new Uint8Array(value) : null
}
