import type { ApicFrame } from './music-cover'

// MP4/M4A keeps duration in mvhd and artwork in the ilst covr atom, all inside moov.
const BOX_HEADER_BYTES = 8
const FULL_BOX_BYTES = 4
const TYPE_BYTES = 4
const LOCALE_BYTES = 4
const MAX_BOX_DEPTH = 5
const CONTAINER_BOXES = ['moov', 'udta', 'meta', 'ilst', 'trak', 'mdia', 'minf', 'stbl']
const COVER_ATOM = 'covr'
const COPYRIGHT_SIGN = String.fromCharCode(0xa9)
const LYRICS_ATOM = COPYRIGHT_SIGN + 'lyr'
const DATA_BOX = 'data'
const COVER_TYPE_PNG = 14

export interface Mp4Box {
  header: number
  start: number
  end: number
}

export function isMp4(bytes: Uint8Array): boolean {
  return bytes.byteLength >= BOX_HEADER_BYTES && boxType(bytes, 4) === 'ftyp'
}

export function findMp4Box(bytes: Uint8Array, start: number, end: number, type: string, depth = 0): Mp4Box | null {
  let offset = start
  while (offset + BOX_HEADER_BYTES <= end) {
    const size = readUint32(bytes, offset)
    if (size < BOX_HEADER_BYTES || offset + size > end) return null
    const box = { header: offset, start: offset + BOX_HEADER_BYTES, end: offset + size }
    const kind = boxType(bytes, offset + 4)
    if (kind === type) return box
    // The meta box carries its own version and flags before its children.
    const childStart = box.start + (kind === 'meta' ? FULL_BOX_BYTES : 0)
    if (depth < MAX_BOX_DEPTH && CONTAINER_BOXES.includes(kind)) {
      const inner = findMp4Box(bytes, childStart, box.end, type, depth + 1)
      if (inner) return inner
    }
    offset = box.end
  }
  return null
}

export function readMp4DurationMs(bytes: Uint8Array): number {
  const mvhd = findMp4Box(bytes, 0, bytes.byteLength, 'mvhd')
  if (!mvhd) return 0
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const isVersionOne = bytes[mvhd.start] === 1
  const timescale = isVersionOne ? view.getUint32(mvhd.start + 20) : view.getUint32(mvhd.start + 12)
  const duration = isVersionOne ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16)
  if (!timescale || !duration) return 0
  return Math.round((duration / timescale) * 1000)
}

export function readMp4Cover(bytes: Uint8Array): ApicFrame | null {
  const data = readAtomData(bytes, COVER_ATOM)
  if (!data) return null
  const picture = bytes.subarray(data.start, data.end)
  if (picture.byteLength < 64) return null
  return { mime: data.kind === COVER_TYPE_PNG ? 'image/png' : 'image/jpeg', bytes: picture }
}

export function readMp4Lyrics(bytes: Uint8Array): string | null {
  const data = readAtomData(bytes, LYRICS_ATOM)
  if (!data) return null
  const text = new TextDecoder().decode(bytes.subarray(data.start, data.end)).trim()
  return text || null
}

// Metadata atoms wrap their value in a data box: version and flags, value type, locale, payload.
function readAtomData(bytes: Uint8Array, atom: string): { kind: number; start: number; end: number } | null {
  const box = findMp4Box(bytes, 0, bytes.byteLength, atom)
  if (!box) return null
  const data = findMp4Box(bytes, box.start, box.end, DATA_BOX)
  if (!data) return null
  const kind = readUint32(bytes, data.start + FULL_BOX_BYTES)
  return { kind, start: data.start + FULL_BOX_BYTES + TYPE_BYTES + LOCALE_BYTES, end: data.end }
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0)
}
