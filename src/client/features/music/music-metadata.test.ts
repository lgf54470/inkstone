import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeTrackDuration, scanTrackMetadata, type TrackProbe } from './music-metadata'

const ID3_TAG_BYTES = 45
const ID3_HEADER_BYTES_EXTENDED = 10
const MPEG1_320_KBPS = [0xff, 0xfb, 0xe0, 0x00]

function serve(bytes: Uint8Array): void {
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    const match = /bytes=(\d+)-(\d+)/.exec(String(new Headers(init?.headers).get('Range')))
    const start = match ? Number(match[1]) : 0
    const end = match ? Math.min(Number(match[2]) + 1, bytes.byteLength) : bytes.byteLength
    const body = bytes.slice(start, end)
    return Promise.resolve({ ok: start < bytes.byteLength, arrayBuffer: () => Promise.resolve(body.buffer) })
  })
}

function probe(sizeBytes: number, mime: string): TrackProbe {
  return { id: 'track', sizeBytes, mime }
}

// A wrongly labelled FLAC that actually holds an ID3 tag followed by MP3 frames.
function id3PrefixedMp3(totalAudioBytes: number): Uint8Array {
  const bytes = new Uint8Array(ID3_TAG_BYTES + totalAudioBytes)
  bytes.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, ID3_TAG_BYTES - 10], 0)
  bytes.set(MPEG1_320_KBPS, ID3_TAG_BYTES)
  return bytes
}

// ID3v2.3 frames: encoding byte, synchsafe-free big endian size, two flag bytes, payload.
function id3Frame(id: string, payload: number[]): number[] {
  const size = payload.length
  return [
    ...[...id].map((char) => char.charCodeAt(0)),
    (size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff,
    0, 0,
    ...payload,
  ]
}

function id3WithTextFrames(): Uint8Array {
  const text = (value: string): number[] => [3, ...new TextEncoder().encode(value)]
  const frames = [
    ...id3Frame('TIT2', text('Moonlight')),
    ...id3Frame('TPE1', text('Hu Yanbin')),
    ...id3Frame('TALB', text('Qin Moon')),
    ...id3Frame('USLT', [3, ...new TextEncoder().encode('eng'), 0, ...new TextEncoder().encode('[00:00.000]first line')]),
  ]
  const tagSize = frames.length
  const bytes = new Uint8Array(ID3_HEADER_BYTES_EXTENDED + tagSize + 2048)
  bytes.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0)
  bytes.set([(tagSize >> 21) & 0x7f, (tagSize >> 14) & 0x7f, (tagSize >> 7) & 0x7f, tagSize & 0x7f], 6)
  bytes.set(frames, ID3_HEADER_BYTES_EXTENDED)
  bytes.set(MPEG1_320_KBPS, ID3_HEADER_BYTES_EXTENDED + tagSize)
  return bytes
}

function flacStreamInfo(sampleRate: number, totalSamples: number): Uint8Array {
  const bytes = new Uint8Array(8 + 34)
  bytes.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 34], 0)
  const packed = (BigInt(sampleRate) << 44n) | (1n << 41n) | (15n << 36n) | BigInt(totalSamples)
  for (let index = 0; index < 8; index += 1) bytes[18 + index] = Number((packed >> BigInt(8 * (7 - index))) & 0xffn)
  return bytes
}

function mp4Movie(timescale: number, duration: number): Uint8Array {
  const movieHeader = new Uint8Array(20)
  new DataView(movieHeader.buffer).setUint32(12, timescale, false)
  new DataView(movieHeader.buffer).setUint32(16, duration, false)
  const payload = new Uint8Array(8 + movieHeader.byteLength)
  new DataView(payload.buffer).setUint32(0, payload.byteLength, false)
  payload.set(new TextEncoder().encode('mvhd'), 4)
  payload.set(movieHeader, 8)
  const fileType = new Uint8Array(16)
  new DataView(fileType.buffer).setUint32(0, 16, false)
  fileType.set(new TextEncoder().encode('ftypM4A '), 4)
  const moov = new Uint8Array(8 + payload.byteLength)
  new DataView(moov.buffer).setUint32(0, moov.byteLength, false)
  moov.set(new TextEncoder().encode('moov'), 4)
  moov.set(payload, 8)
  const bytes = new Uint8Array(fileType.byteLength + moov.byteLength)
  bytes.set(fileType, 0)
  bytes.set(moov, fileType.byteLength)
  return bytes
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scanTrackMetadata', () => {
  it('reads an MP3 that hides behind an ID3 tag despite a FLAC content type', async () => {
    const bytes = id3PrefixedMp3(1_200_000)
    serve(bytes)
    const scan = await scanTrackMetadata(probe(bytes.byteLength, 'audio/flac'))
    expect(scan).toEqual({ coverDataUrl: null, title: null, artist: null, album: null, lyric: null, durationMs: 30_000 })
  })

  it('reads title, artist, album and lyrics from ID3 text frames', async () => {
    const bytes = id3WithTextFrames()
    serve(bytes)
    const scan = await scanTrackMetadata(probe(bytes.byteLength, 'audio/mpeg'))
    expect(scan.title).toBe('Moonlight')
    expect(scan.artist).toBe('Hu Yanbin')
    expect(scan.album).toBe('Qin Moon')
    expect(scan.lyric).toBe('[00:00.000]first line')
  })

  it('reads the STREAMINFO header of a FLAC file', async () => {
    const bytes = flacStreamInfo(44_100, 441_000)
    serve(bytes)
    const scan = await scanTrackMetadata(probe(bytes.byteLength, 'audio/flac'))
    expect(scan.durationMs).toBe(10_000)
  })

  it('reads the movie header of an M4A file', async () => {
    const bytes = mp4Movie(44_100, 441_000)
    serve(bytes)
    const scan = await scanTrackMetadata(probe(bytes.byteLength, 'audio/mp4'))
    expect(scan).toEqual({ coverDataUrl: null, title: null, artist: null, album: null, lyric: null, durationMs: 10_000 })
  })

  it('returns empty metadata for unreadable bytes', async () => {
    serve(new Uint8Array(64))
    expect(await scanTrackMetadata(probe(64, 'audio/mpeg')))
      .toEqual({ coverDataUrl: null, title: null, artist: null, album: null, lyric: null, durationMs: 0 })
  })
})

describe('probeTrackDuration', () => {
  it('falls back to the MP3 frames when a FLAC content type does not hold FLAC', async () => {
    const bytes = id3PrefixedMp3(1_200_000)
    serve(bytes)
    expect(await probeTrackDuration(probe(bytes.byteLength, 'audio/flac'))).toBe(30_000)
  })

  it('needs no tag download for a track that already has metadata', async () => {
    serve(flacStreamInfo(48_000, 960_000))
    expect(await probeTrackDuration(probe(38 + 480_000, 'audio/flac'))).toBe(20_000)
  })
})
