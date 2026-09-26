
export interface ByteRange {
  offset: number
  length: number
}

export type RangeRequest = { kind: 'full' } | { kind: 'partial'; range: ByteRange } | { kind: 'unsatisfiable' }

export function parseByteRange(header: string | null | undefined, size: number): RangeRequest {
  if (!header) return { kind: 'full' }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return { kind: 'unsatisfiable' }
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return { kind: 'unsatisfiable' }

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { kind: 'unsatisfiable' }
    const length = Math.min(suffix, size)
    return size === 0 ? { kind: 'unsatisfiable' } : { kind: 'partial', range: { offset: size - length, length } }
  }

  const start = Number(rawStart)
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return { kind: 'unsatisfiable' }
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isSafeInteger(end) || end < start) return { kind: 'unsatisfiable' }
  const clampedEnd = Math.min(end, size - 1)
  return { kind: 'partial', range: { offset: start, length: clampedEnd - start + 1 } }
}

const CONTENT_RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+|\*)$/

// A third party's range claim is only worth echoing when it describes a real byte
// range: start ≤ end, and the end inside the declared total when one is declared.
// Anything else would teach the player a size that is not there.
export function isWellFormedContentRange(value: string): boolean {
  const match = CONTENT_RANGE_RE.exec(value.trim())
  if (!match) return false
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return false
  if (match[3] === '*') return true
  const total = Number(match[3])
  return Number.isSafeInteger(total) && end < total
}

export function isWellFormedContentLength(value: string): boolean {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed))
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`
}

// Workers KV cannot range-read server-side, so a ranged GET is served by streaming
// the value and slicing it. Aligning to windows keeps the bytes pulled from KV (and
// any future cache key) bounded by the window instead of the whole object.
export const KV_RANGE_WINDOW_BYTES = 1024 * 1024

export function alignKvRangeWindow(range: ByteRange, size: number): ByteRange {
  if (range.length >= KV_RANGE_WINDOW_BYTES) return range
  const start = Math.floor(range.offset / KV_RANGE_WINDOW_BYTES) * KV_RANGE_WINDOW_BYTES
  const requestedEnd = Math.min(size, range.offset + range.length)
  const end = Math.min(
    size,
    Math.max(start + KV_RANGE_WINDOW_BYTES, Math.ceil(requestedEnd / KV_RANGE_WINDOW_BYTES) * KV_RANGE_WINDOW_BYTES),
  )
  return { offset: start, length: end - start }
}
