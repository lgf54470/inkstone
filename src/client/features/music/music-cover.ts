const MAX_TAG_SCAN_BYTES = 4 * 1024 * 1024
const COVER_MAX_EDGE = 320
const COVER_QUALITY = 0.82
const ID3_HEADER_BYTES = 10

// ID3v2 APIC parsing must survive tag sizes beyond the Blob constructor's typed-array view.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function readSynchsafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! & 0x7f) << 21) | ((bytes[offset + 1]! & 0x7f) << 14) | ((bytes[offset + 2]! & 0x7f) << 7) | (bytes[offset + 3]! & 0x7f)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}

interface Id3Frame {
  id: string
  payload: Uint8Array
}

export interface ApicFrame {
  mime: string
  bytes: Uint8Array
}

export function readTagSize(bytes: Uint8Array): number {
  if (bytes.byteLength < ID3_HEADER_BYTES) return 0
  const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  if (!isId3 || bytes[3]! < 2 || bytes[3]! > 4) return 0
  return readSynchsafe(bytes, 6)
}

function readFrames(bytes: Uint8Array): Id3Frame[] {
  if (bytes.byteLength < ID3_HEADER_BYTES) return []
  const version = bytes[3]!
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33 || version < 2 || version > 4) return []
  const end = Math.min(ID3_HEADER_BYTES + readTagSize(bytes), bytes.byteLength, MAX_TAG_SCAN_BYTES)
  // ID3v2.2 frames use 3 character ids (PIC, ULT); v2.3 and v2.4 use 4 (APIC, USLT).
  const idLength = version === 2 ? 3 : 4
  const frameHeader = version === 2 ? 6 : 10
  const frames: Id3Frame[] = []
  let offset = ID3_HEADER_BYTES
  while (offset + frameHeader <= end) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + idLength))
    const size = version === 2
      ? ((bytes[offset + 3]! << 16) | (bytes[offset + 4]! << 8) | bytes[offset + 5]!)
      : version === 4
        ? readSynchsafe(bytes, offset + 4)
        : readUint32(bytes, offset + 4)
    if (/^\u0000+$/.test(id) || size <= 0) break
    const start = offset + frameHeader
    if (start + size > bytes.byteLength) break
    frames.push({ id, payload: bytes.subarray(start, start + size) })
    offset = start + size
  }
  return frames
}

export function readEmbeddedCover(bytes: Uint8Array): ApicFrame | null {
  for (const frame of readFrames(bytes)) {
    if (frame.id === 'APIC') {
      const parsed = parseApicPayload(frame.payload)
      if (parsed) return parsed
    }
    if (frame.id === 'PIC') {
      const parsed = parsePicPayload(frame.payload)
      if (parsed) return parsed
    }
  }
  return null
}

// ID3v2.2 pictures carry a three character format instead of a mime type.
function parsePicPayload(frame: Uint8Array): ApicFrame | null {
  if (frame.byteLength < 6) return null
  const format = new TextDecoder().decode(frame.subarray(1, 4)).toUpperCase()
  const mime = format === 'PNG' ? 'image/png' : 'image/jpeg'
  let cursor = 4
  cursor += 1
  cursor = skipEncodedText(frame, cursor)
  if (cursor >= frame.byteLength) return null
  const picture = frame.subarray(cursor)
  if (picture.byteLength < 64) return null
  return { mime, bytes: picture }
}

export interface EmbeddedTags {
  title: string | null
  artist: string | null
  album: string | null
  lyric: string | null
}

// Text frames keep the same meaning across ID3v2.2 (three character ids) and v2.3+/v2.4.
const TEXT_FRAMES: Record<string, 'title' | 'artist' | 'album'> = {
  TIT2: 'title',
  TT2: 'title',
  TPE1: 'artist',
  TP1: 'artist',
  TALB: 'album',
  TAL: 'album',
}

// Lyrics live in USLT (plain) or a LYRICS TXXX frame, depending on the tagger.
export function readEmbeddedTags(bytes: Uint8Array): EmbeddedTags {
  const tags: EmbeddedTags = { title: null, artist: null, album: null, lyric: null }
  for (const frame of readFrames(bytes)) {
    const field = TEXT_FRAMES[frame.id]
    if (field) {
      tags[field] ??= decodeTextFrame(frame.payload)
      continue
    }
    if (frame.id === 'USLT' || frame.id === 'ULT') tags.lyric ??= decodeLyricPayload(frame.payload)
    else if (frame.id === 'TXXX' || frame.id === 'TXX') tags.lyric ??= decodeUserText(frame.payload)
  }
  return tags
}

function decodeTextFrame(payload: Uint8Array): string | null {
  if (payload.byteLength < 2) return null
  const text = decodeText(payload.subarray(1), payload[0] ?? 0).replace(/\u0000+$/, '').trim()
  return text || null
}

function decodeUserText(payload: Uint8Array): string | null {
  const encoding = payload[0] ?? 0
  const body = payload.subarray(1)
  const separator = encoding === 1 || encoding === 2 ? findDoubleZero(body) : findSingleZero(body)
  if (separator.end <= 0) return null
  const description = decodeText(body.subarray(0, separator.end), encoding).trim()
  if (!/lyric/i.test(description)) return null
  const value = decodeText(body.subarray(separator.end + separator.size), encoding).trim()
  return value || null
}

function decodeLyricPayload(payload: Uint8Array): string | null {
  const encoding = payload[0] ?? 0
  const body = payload.subarray(4)
  const separator = encoding === 1 || encoding === 2 ? findDoubleZero(body) : findSingleZero(body)
  const from = separator.end > 0 ? separator.end + separator.size : 0
  // An empty descriptor still carries its terminator, which decodes as a leading null.
  const text = decodeText(body.subarray(from), encoding).replace(/^\u0000+/, '').trim()
  return text || null
}

function findSingleZero(bytes: Uint8Array): { end: number; size: number } {
  for (let index = 0; index < bytes.byteLength; index += 1) if (bytes[index] === 0) return { end: index, size: 1 }
  return { end: -1, size: 0 }
}

function findDoubleZero(bytes: Uint8Array): { end: number; size: number } {
  for (let index = 0; index + 1 < bytes.byteLength; index += 2) {
    if (bytes[index] === 0 && bytes[index + 1] === 0) return { end: index, size: 2 }
  }
  return { end: -1, size: 0 }
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  if (encoding === 0) return new TextDecoder('latin1').decode(bytes)
  if (encoding === 1) {
    const hasBom = bytes.byteLength >= 2 && (bytes[0] !== 0 || bytes[1] !== 0)
    const label = hasBom && bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : 'utf-16be'
    return new TextDecoder(label).decode(bytes)
  }
  if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

function parseApicPayload(frame: Uint8Array): ApicFrame | null {
  const encoding = frame[0] ?? 0
  const mimeEnd = indexOfZero(frame, 1)
  if (mimeEnd === -1) return null
  const mime = new TextDecoder().decode(frame.subarray(1, mimeEnd))
  // mime terminator + picture type byte, then the encoded description.
  const descriptionEnd = skipEncodedDescription(frame, mimeEnd + 2, encoding)
  if (descriptionEnd >= frame.byteLength) return null
  const picture = frame.subarray(descriptionEnd)
  if (picture.byteLength < 64) return null
  return { mime: mime || 'image/jpeg', bytes: picture }
}

// UTF-16 descriptions end on a null code unit, single byte encodings on one null.
function skipEncodedDescription(frame: Uint8Array, from: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let index = from; index + 1 < frame.byteLength; index += 2) {
      if (frame[index] === 0 && frame[index + 1] === 0) return index + 2
    }
    return from
  }
  const end = indexOfZero(frame, from)
  return end === -1 ? from : end + 1
}

function indexOfZero(bytes: Uint8Array, from: number): number {
  for (let index = from; index < bytes.byteLength; index += 1) if (bytes[index] === 0) return index
  return -1
}

function skipEncodedText(frame: Uint8Array, from: number): number {
  const end = indexOfZero(frame, from)
  return end === -1 ? from : end + 1
}

export async function coverDataUrlFromBytes(bytes: Uint8Array): Promise<string | null> {
  const frame = readEmbeddedCover(bytes)
  return frame ? coverDataUrlFromFrame(frame) : null
}

export async function coverDataUrlFromFrame(frame: ApicFrame): Promise<string | null> {
  return downscale(frame)
}

async function downscale(frame: ApicFrame): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  const blob = new Blob([toArrayBuffer(frame.bytes)], { type: frame.mime })
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, COVER_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return null
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', COVER_QUALITY)
}

