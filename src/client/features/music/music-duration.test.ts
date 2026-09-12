import { describe, expect, it } from 'vitest'
import { readFlacDurationMs, readMp3DurationMs } from './music-duration'

const MPEG1_LAYER3 = 3
const MPEG2_LAYER3 = 2
const STEREO = 0
const SIDE_INFO_MPEG1_STEREO = 32
const BITRATE_128_KBPS_V1 = 9
const BITRATE_64_KBPS_V2 = 8
const RATE_44100 = 0
const RATE_22050 = 0

function frameHeader(versionBits: number, bitrateIndex: number, sampleRateIndex: number): number[] {
  return [0xff, 0xe0 | (versionBits << 3) | (MPEG1_LAYER3 << 1), (bitrateIndex << 4) | (sampleRateIndex << 2), STEREO << 6]
}

function mp3Audio(frameBytes: number, header: number[] = frameHeader(MPEG1_LAYER3, BITRATE_128_KBPS_V1, RATE_44100)): Uint8Array {
  const audio = new Uint8Array(frameBytes)
  audio.set(header, 0)
  return audio
}

function mp3WithXingFrameCount(frames: number): Uint8Array {
  const audio = mp3Audio(4 + SIDE_INFO_MPEG1_STEREO + 12)
  const tag = 4 + SIDE_INFO_MPEG1_STEREO
  audio.set([0x58, 0x69, 0x6e, 0x67], tag)
  audio[tag + 7] = 0x01
  new DataView(audio.buffer).setUint32(tag + 8, frames, false)
  return audio
}

// STREAMINFO starts after the 4 byte magic and its block header; sample rate and total samples are adjacent.
function flacStreamInfo(sampleRate: number, totalSamples: number): Uint8Array {
  const bytes = new Uint8Array(8 + 34)
  bytes.set([0x66, 0x4c, 0x61, 0x43], 0)
  bytes[4] = 0x80
  bytes[7] = 34
  const packed = (BigInt(sampleRate) << 44n) | (1n << 41n) | (15n << 36n) | BigInt(totalSamples)
  for (let index = 0; index < 8; index += 1) {
    bytes[18 + index] = Number((packed >> BigInt(8 * (7 - index))) & 0xffn)
  }
  return bytes
}

describe('readMp3DurationMs', () => {
  it('estimates a constant bitrate track from the first frame header', () => {
    expect(readMp3DurationMs(mp3Audio(4096), (128_000 / 8) * 30)).toBe(30_000)
  })

  it('measures from the frame sync when the window starts with padding', () => {
    const audio = mp3Audio(4096)
    audio.set([0x00, 0x00, 0x00], 0)
    audio.set(frameHeader(MPEG1_LAYER3, BITRATE_128_KBPS_V1, RATE_44100), 3)
    expect(readMp3DurationMs(audio, (128_000 / 8) * 10 + 3)).toBe(10_000)
  })

  it('prefers the Xing frame count of a variable bitrate track', () => {
    expect(readMp3DurationMs(mp3WithXingFrameCount(1000), 1_000_000)).toBe(Math.round((1000 * 1152 / 44100) * 1000))
  })

  it('reads the MPEG2 bitrate table and frame length', () => {
    const audio = mp3Audio(4096, frameHeader(MPEG2_LAYER3, BITRATE_64_KBPS_V2, RATE_22050))
    expect(readMp3DurationMs(audio, (64_000 / 8) * 20)).toBe(20_000)
  })

  it('returns zero without a usable frame header', () => {
    expect(readMp3DurationMs(new Uint8Array(2048), 500_000)).toBe(0)
    expect(readMp3DurationMs(mp3Audio(4096), 0)).toBe(0)
  })
})

describe('readFlacDurationMs', () => {
  it('divides total samples by the stream sample rate', () => {
    expect(readFlacDurationMs(flacStreamInfo(44_100, 441_000))).toBe(10_000)
    expect(readFlacDurationMs(flacStreamInfo(48_000, 960_000))).toBe(20_000)
  })

  it('returns zero for truncated or foreign data', () => {
    expect(readFlacDurationMs(flacStreamInfo(44_100, 441_000).slice(0, 20))).toBe(0)
    expect(readFlacDurationMs(new Uint8Array(64))).toBe(0)
  })
})
