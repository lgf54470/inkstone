import type { Env } from '../../env'
import { hasAttachmentStorage, selectAttachmentStorage } from '../../attachments/backend'
import type { AttachmentObjectStorage } from '../../attachments/keys'
import { ApiError } from '../../lib/errors'
import type { ByteRange } from './range'

// KV values cap at 25 MiB, well under the R2 allowance, so the upload limit follows the backend.
export const KV_VALUE_MAX_BYTES = 25 * 1024 * 1024

export interface MusicObjectStream {
  body: ReadableStream<Uint8Array>
  length: number
}

export function requireMusicStorage(env: Env): AttachmentObjectStorage {
  const storage = selectAttachmentStorage(env)
  if (!storage || !hasAttachmentStorage(env, storage)) {
    throw new ApiError(503, 'storage_unavailable', 'Music storage is not configured')
  }
  return storage
}

export function maxUploadBytes(storage: AttachmentObjectStorage): number {
  return storage === 'kv' ? KV_VALUE_MAX_BYTES : Number.MAX_SAFE_INTEGER
}

export async function putMusicObject(
  env: Env,
  storage: AttachmentObjectStorage,
  key: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  if (storage === 'r2') {
    if (!env.FILES) throw new ApiError(503, 'storage_unavailable', 'R2 storage is not bound')
    await env.FILES.put(key, bytes, {
      httpMetadata: { contentType: mime, cacheControl: 'private, max-age=3600' },
      customMetadata: { kind: 'music' },
    })
    return
  }
  if (!env.FILES_KV) throw new ApiError(503, 'storage_unavailable', 'KV storage is not bound')
  await env.FILES_KV.put(key, bytes, { metadata: { kind: 'music', mime } })
}

export async function readMusicObjectStream(
  env: Env,
  storage: AttachmentObjectStorage,
  key: string,
  range: ByteRange | null,
): Promise<MusicObjectStream | null> {
  if (storage === 'r2') {
    if (!env.FILES) throw new ApiError(503, 'storage_unavailable', 'R2 storage is not bound')
    const object = await env.FILES.get(key, range ? { range: { offset: range.offset, length: range.length } } : undefined)
    if (!object) return null
    const body = object.body as ReadableStream<Uint8Array>
    return { body, length: range ? range.length : object.size }
  }
  if (!env.FILES_KV) throw new ApiError(503, 'storage_unavailable', 'KV storage is not bound')
  const value = await env.FILES_KV.get(key, 'arrayBuffer')
  if (!value) return null
  const bytes = new Uint8Array(value)
  const slice = range ? bytes.subarray(range.offset, range.offset + range.length) : bytes
  return { body: new Response(slice).body as ReadableStream<Uint8Array>, length: slice.byteLength }
}

export async function musicObjectSize(
  env: Env,
  storage: AttachmentObjectStorage,
  key: string,
): Promise<number | null> {
  if (storage === 'r2') {
    if (!env.FILES) throw new ApiError(503, 'storage_unavailable', 'R2 storage is not bound')
    const head = await env.FILES.head(key)
    return head ? head.size : null
  }
  if (!env.FILES_KV) throw new ApiError(503, 'storage_unavailable', 'KV storage is not bound')
  const value = await env.FILES_KV.get(key, 'arrayBuffer')
  return value ? value.byteLength : null
}

export async function deleteMusicObjects(
  env: Env,
  storage: AttachmentObjectStorage,
  keys: readonly string[],
): Promise<void> {
  if (!keys.length) return
  if (storage === 'r2') {
    if (!env.FILES) throw new ApiError(503, 'storage_unavailable', 'R2 storage is not bound')
    await env.FILES.delete([...keys])
    return
  }
  if (!env.FILES_KV) throw new ApiError(503, 'storage_unavailable', 'KV storage is not bound')
  await Promise.all(keys.map((key) => env.FILES_KV!.delete(key)))
}
