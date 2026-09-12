import type { ApicFrame } from './music-cover'

// FLAC keeps artwork in a PICTURE block and lyrics in a Vorbis comment, not ID3.
const FLAC_MAGIC = [0x66, 0x4c, 0x61, 0x43]
const BLOCK_VORBIS_COMMENT = 4
const BLOCK_PICTURE = 6
const HEADER_BYTES = 4

export interface FlacTags {
  title: string | null
  artist: string | null
  album: string | null
  lyric: string | null
}

export interface FlacScan extends FlacTags {
  cover: ApicFrame | null
  neededBytes: number
}

export function isFlac(bytes: Uint8Array): boolean {
  return bytes.byteLength >= HEADER_BYTES && FLAC_MAGIC.every((byte, index) => bytes[index] === byte)
}

export function readFlacMetadata(bytes: Uint8Array): FlacScan {
  const result: FlacScan = { cover: null, title: null, artist: null, album: null, lyric: null, neededBytes: 0 }
  if (!isFlac(bytes)) return result
  let offset = HEADER_BYTES
  let isLast = false
  while (!isLast && offset + 4 <= bytes.byteLength) {
    const header = bytes[offset]!
    isLast = (header & 0x80) !== 0
    const type = header & 0x7f
    const length = ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
    const start = offset + 4
    const end = start + length
    if (end > bytes.byteLength) {
      if (type === BLOCK_PICTURE || type === BLOCK_VORBIS_COMMENT) result.neededBytes = end
      return result
    }
    const payload = bytes.subarray(start, end)
    if (type === BLOCK_PICTURE && !result.cover) result.cover = parsePictureBlock(payload)
    if (type === BLOCK_VORBIS_COMMENT && !result.lyric) Object.assign(result, readVorbisTags(payload))
    offset = end
  }
  return result
}

function parsePictureBlock(payload: Uint8Array): ApicFrame | null {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let cursor = 4
  const mimeLength = view.getUint32(cursor)
  cursor += 4
  if (cursor + mimeLength > payload.byteLength) return null
  const mime = new TextDecoder().decode(payload.subarray(cursor, cursor + mimeLength))
  cursor += mimeLength
  const descriptionLength = view.getUint32(cursor)
  cursor += 4 + descriptionLength + 16
  if (cursor + 4 > payload.byteLength) return null
  const dataLength = view.getUint32(cursor)
  cursor += 4
  if (cursor + dataLength > payload.byteLength) return null
  const picture = payload.subarray(cursor, cursor + dataLength)
  if (picture.byteLength < 64) return null
  return { mime: mime || 'image/jpeg', bytes: picture }
}

// Vorbis comments store their lengths little endian, unlike the FLAC blocks around them.
function readVorbisTags(payload: Uint8Array): FlacTags {
  const tags: FlacTags = { title: null, artist: null, album: null, lyric: null }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let cursor = 0
  const vendorLength = view.getUint32(cursor, true)
  cursor += 4 + vendorLength
  if (cursor + 4 > payload.byteLength) return tags
  const count = view.getUint32(cursor, true)
  cursor += 4
  for (let index = 0; index < count && cursor + 4 <= payload.byteLength; index += 1) {
    const length = view.getUint32(cursor, true)
    cursor += 4
    if (cursor + length > payload.byteLength) return tags
    const entry = new TextDecoder().decode(payload.subarray(cursor, cursor + length))
    cursor += length
    applyVorbisEntry(tags, entry)
  }
  return tags
}

function applyVorbisEntry(tags: FlacTags, entry: string): void {
  const separator = entry.indexOf('=')
  if (separator <= 0) return
  const key = entry.slice(0, separator).toUpperCase()
  const value = entry.slice(separator + 1).trim()
  if (!value) return
  if (key === 'TITLE') {
    tags.title ??= value
    return
  }
  if (key === 'ARTIST') {
    tags.artist ??= value
    return
  }
  if (key === 'ALBUM') {
    tags.album ??= value
    return
  }
  if (key === 'LYRICS' || key === 'UNSYNCEDLYRICS') tags.lyric ??= value
}
