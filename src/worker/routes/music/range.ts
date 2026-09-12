
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

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`
}
