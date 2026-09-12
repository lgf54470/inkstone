import { describe, expect, it } from 'vitest'
import { findMp4Box, isMp4, readMp4Cover, readMp4DurationMs, readMp4Lyrics } from './music-mp4'

const COPYRIGHT_LYRICS_ATOM = String.fromCharCode(0xa9) + 'lyr'
const PICTURE_BYTES = concat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), new Uint8Array(76))

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.byteLength)
  new DataView(bytes.buffer).setUint32(0, bytes.byteLength, false)
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index)
  bytes.set(payload, 8)
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

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function mvhdBox(version: 0 | 1, timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(version === 1 ? 32 : 20)
  const view = new DataView(payload.buffer)
  payload[0] = version
  if (version === 1) {
    view.setUint32(20, timescale, false)
    view.setBigUint64(24, BigInt(duration), false)
  } else {
    view.setUint32(12, timescale, false)
    view.setUint32(16, duration, false)
  }
  return box('mvhd', payload)
}

function dataAtom(kind: number, value: Uint8Array = PICTURE_BYTES): Uint8Array {
  return box('data', concat(new Uint8Array(4), uint32(kind), uint32(0), value))
}

function moovWith(children: Uint8Array[]): Uint8Array {
  return box('moov', concat(...children))
}

describe('isMp4', () => {
  it('recognises the file type box', () => {
    expect(isMp4(concat(uint32(32), new TextEncoder().encode('ftypM4A ')))).toBe(true)
    expect(isMp4(new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]))).toBe(false)
    expect(isMp4(new Uint8Array(4))).toBe(false)
  })
})

describe('readMp4DurationMs', () => {
  it('divides the movie duration by its timescale', () => {
    expect(readMp4DurationMs(moovWith([mvhdBox(0, 44_100, 441_000)]))).toBe(10_000)
    expect(readMp4DurationMs(moovWith([mvhdBox(0, 1000, 250_500)]))).toBe(250_500)
  })

  it('reads the 64 bit form of version 1', () => {
    expect(readMp4DurationMs(moovWith([mvhdBox(1, 48_000, 960_000)]))).toBe(20_000)
  })

  it('returns zero without a movie header', () => {
    expect(readMp4DurationMs(moovWith([box('free', new Uint8Array(8))]))).toBe(0)
  })
})

describe('findMp4Box', () => {
  it('descends into container boxes and stops at malformed sizes', () => {
    const bytes = moovWith([box('udta', box('meta', concat(new Uint8Array(4), box('ilst', box('covr', uint32(1))))))])
    expect(findMp4Box(bytes, 0, bytes.byteLength, 'covr')?.end).toBe(bytes.byteLength)
    expect(findMp4Box(bytes, 0, bytes.byteLength, 'mvhd')).toBeNull()
  })
})

describe('readMp4Cover', () => {
  it('unwraps the data box of the artwork atom', () => {
    const cover = readMp4Cover(moovWith([box('udta', box('meta', concat(new Uint8Array(4), box('ilst', box('covr', dataAtom(13))))))]))
    expect(cover?.mime).toBe('image/jpeg')
    expect(cover?.bytes).toEqual(PICTURE_BYTES)
  })

  it('maps the PNG type indicator', () => {
    const cover = readMp4Cover(moovWith([box('udta', box('meta', concat(new Uint8Array(4), box('ilst', box('covr', dataAtom(14))))))]))
    expect(cover?.mime).toBe('image/png')
  })

  it('returns null when the file carries no artwork atom', () => {
    expect(readMp4Cover(moovWith([mvhdBox(0, 1000, 1000)]))).toBeNull()
  })
})

describe('readMp4Lyrics', () => {
  it('decodes the lyrics atom text', () => {
    const atom = box(COPYRIGHT_LYRICS_ATOM, dataAtom(1, new TextEncoder().encode('  first line  ')))
    expect(readMp4Lyrics(moovWith([box('udta', box('meta', concat(new Uint8Array(4), box('ilst', atom))))]))).toBe('first line')
  })
})