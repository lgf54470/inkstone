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
  if (range) {
    // KV has no native byte range: stream the value and slice, so a Range request
    // never materialises the whole (up to 25 MiB) value inside the isolate.
    const source = await env.FILES_KV.get(key, 'stream')
    if (!source) return null
    return { body: sliceKvStream(source as ReadableStream<Uint8Array>, range), length: range.length }
  }
  const value = await env.FILES_KV.get(key, 'arrayBuffer')
  if (!value) return null
  return { body: new Response(value).body as ReadableStream<Uint8Array>, length: value.byteLength }
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
