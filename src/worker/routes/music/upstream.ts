import { LIMITS } from '@shared/constants'
import { ApiError } from '../../lib/errors'
import { isAllowedOutboundUrl } from '../../lib/outbound-url'

// FB-S1 / FB-S3: the music proxy streams addresses chosen by a catalogue, by an upstream answer or
// by the reader's own reference row, so the address rule is applied here rather than trusted to the
// runtime flag. `global_fetch_strictly_public` refuses private ranges as a last resort; this is the
// policy, and it is checked before a byte leaves.
export function parseMusicUpstreamUrl(rawUrl: string, allowHttp: boolean): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The track source address is unusable')
  }
  if (!isAllowedOutboundUrl(url, { allowHttp })) {
    throw new ApiError(502, 'storage_unavailable', 'The track source address is not reachable from this server')
  }
  return url
}

// FB-S1: what is bounded is the wait for the response *head*, not the transfer — a song streams for
// minutes, and a signal left armed would cut the body off mid-note. The timer is cleared the moment
// the answer arrives (or the call fails), so the signal only ever covers the part a reader waits on.
export async function withHeadTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIMITS.musicStreamConnectTimeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

// The signal is ours and only ours, so an abort names the timeout and nothing else. The name is read
// rather than `instanceof AbortError` because the thrown value is the host's `DOMException`.
function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

export async function fetchMusicUpstream(
  rawUrl: string,
  init: { headers?: Record<string, string>; allowHttp?: boolean } = {},
): Promise<Response> {
  const url = parseMusicUpstreamUrl(rawUrl, init.allowHttp === true)
  try {
    return await withHeadTimeout((signal) =>
      fetch(url, { ...(init.headers ? { headers: init.headers } : {}), signal }),
    )
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (isAbortError(error)) {
      throw new ApiError(502, 'storage_unavailable', 'The track source took too long to answer')
    }
    console.warn('[inkstone] music upstream fetch failed:', error)
    throw new ApiError(502, 'storage_unavailable', 'The track source is unreachable')
  }
}

// FB-S1: a soft cap on one response's body. Nothing upstream says about its own size is trusted, so
// the count is kept here; crossing it fails the stream instead of filling the response with bytes
// nobody asked for. The cap sits far above any real track, so it is a runaway guard, not a quota.
export function capStreamBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): ReadableStream<Uint8Array> | null {
  if (!body) return null
  let seen = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > maxBytes) {
        controller.error(new Error('upstream stream exceeded the byte cap'))
        return
      }
      controller.enqueue(chunk)
    },
  })
  return body.pipeThrough(counter)
}
