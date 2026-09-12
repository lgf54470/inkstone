import { describe, expect, it } from 'vitest'
import { isFlac, readFlacMetadata } from './music-flac'

const BLOCK_VORBIS_COMMENT = 4
const BLOCK_PICTURE = 6
const PICTURE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(76).fill(0)])

function littleEndian32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function bigEndian32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged
}

function block(type: number, payload: Uint8Array, isLast = false): Uint8Array {
  const header = new Uint8Array(4)
  header[0] = (isLast ? 0x80 : 0) | type
  header[1] = (payload.byteLength >> 16) & 0xff
  header[2] = (payload.byteLength >> 8) & 0xff
  header[3] = payload.byteLength & 0xff
  return concat(header, payload)
}

function vorbisComment(entries: string[]): Uint8Array {
  const vendor = new TextEncoder().encode('inkstone')
  const parts = [littleEndian32(vendor.byteLength), vendor, littleEndian32(entries.length)]
  for (const entry of entries) {
    const encoded = new TextEncoder().encode(entry)
    parts.push(littleEndian32(encoded.byteLength), encoded)
  }
  return concat(...parts)
}

function pictureBlock(): Uint8Array {
  const mime = new TextEncoder().encode('image/jpeg')
  return concat(
    bigEndian32(3),
    bigEndian32(mime.byteLength),
    mime,
    bigEndian32(0),
    bigEndian32(1),
    bigEndian32(1),
    bigEndian32(24),
    bigEndian32(0),
    bigEndian32(PICTURE_BYTES.byteLength),
    PICTURE_BYTES,
  )
}

function flacFile(...blocks: Uint8Array[]): Uint8Array {
  return concat(new Uint8Array([0x66, 0x4c, 0x61, 0x43]), block(0, new Uint8Array(34)), ...blocks)
}

describe('isFlac', () => {
  it('checks the stream marker', () => {
    expect(isFlac(flacFile())).toBe(true)
    expect(isFlac(new Uint8Array([0x49, 0x44, 0x33, 0x03]))).toBe(false)
  })
})

describe('readFlacMetadata', () => {
  it('reads a lyrics entry from a little endian Vorbis comment', () => {
    const bytes = flacFile(block(BLOCK_VORBIS_COMMENT, vorbisComment(['TITLE=Song', 'Lyrics=first line\nsecond line']), true))
    expect(readFlacMetadata(bytes).lyric).toBe('first line\nsecond line')
  })

  it('keeps the first lyrics entry when a comment carries two', () => {
    const comment = vorbisComment(['LYRICS=plain', 'UNSYNCEDLYRICS=timed'])
    expect(readFlacMetadata(flacFile(block(BLOCK_VORBIS_COMMENT, comment, true))).lyric).toBe('plain')
  })

  it('reads title, artist and album entries from the same comment', () => {
    const comment = vorbisComment(['TITLE=Moonlight', 'ARTIST=Hu Yanbin', 'ALBUM=Qin Moon', 'LYRICS=first line'])
    const scanned = readFlacMetadata(flacFile(block(BLOCK_VORBIS_COMMENT, comment, true)))
    expect(scanned.title).toBe('Moonlight')
    expect(scanned.artist).toBe('Hu Yanbin')
    expect(scanned.album).toBe('Qin Moon')
    expect(scanned.lyric).toBe('first line')
  })

  it('returns no lyrics for a comment without a lyrics entry', () => {
    const bytes = flacFile(block(BLOCK_VORBIS_COMMENT, vorbisComment(['TITLE=Song', 'ARTIST=Someone']), true))
    expect(readFlacMetadata(bytes).lyric).toBeNull()
  })

  it('unwraps the artwork of a picture block', () => {
    const bytes = flacFile(block(BLOCK_PICTURE, pictureBlock(), true))
    const scanned = readFlacMetadata(bytes)
    expect(scanned.cover?.mime).toBe('image/jpeg')
    expect(scanned.cover?.bytes).toEqual(PICTURE_BYTES)
  })

  it('asks for a larger window when a block is truncated', () => {
    const full = flacFile(block(BLOCK_PICTURE, pictureBlock(), true))
    const scanned = readFlacMetadata(full.subarray(0, 60))
    expect(scanned.cover).toBeNull()
    expect(scanned.neededBytes).toBe(full.byteLength)
  })
})
