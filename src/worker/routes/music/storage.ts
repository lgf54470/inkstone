import type { Env } from '../../env'
import { hasAttachmentStorage, selectAttachmentStorage } from '../../attachments/backend'
import type { AttachmentObjectStorage } from '../../attachments/keys'
import { ApiError } from '../../lib/errors'
import type { ByteRange } from './range'

// KV values cap at 25 MiB, well under the R2 allowance, so the upload limit follows the backend.
export const KV_VALUE_MAX_BYTES = 25 * 1024 * 1024

export interface MusicObjectStream {
  body: ReadableStream<Uint8Array>
  /** `null` when the backend cannot state a size up front (a KV value stored before sizes were kept). */
  length: number | null
}

// KV has no size API, so the byte count rides along in the value metadata.
interface MusicKvMetadata {
  kind?: string
  mime?: string
  size?: number
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
  await env.FILES_KV.put(key, bytes, { metadata: { kind: 'music', mime, size: bytes.byteLength } })
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
  // Neither a range nor a whole read buffers: KV has no byte range, and a value
  // can be 25 MiB, so the isolate only ever holds the chunk in flight.
  const { value, metadata } = await env.FILES_KV.getWithMetadata<MusicKvMetadata>(key, { type: 'stream' })
  if (!value) return null
  const source = value as ReadableStream<Uint8Array>
  if (range) return { body: sliceKvStream(source, range), length: range.length }
  const size = typeof metadata?.size === 'number' ? metadata.size : null
  return { body: source, length: size }
}

function sliceKvStream(source: ReadableStream<Uint8Array>, range: ByteRange): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  const windowEnd = range.offset + range.length
  let position = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        const chunkStart = position
        position += value.byteLength
        if (position <= range.offset || chunkStart >= windowEnd) continue
        const from = Math.max(0, range.offset - chunkStart)
        const to = Math.min(value.byteLength, windowEnd - chunkStart)
        controller.enqueue(value.subarray(from, to))
        if (position >= windowEnd) {
          await reader.cancel()
          controller.close()
        }
        return
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
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
