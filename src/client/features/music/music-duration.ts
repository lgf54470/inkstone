const SAMPLES_PER_FRAME_MPEG1 = 1152
const SAMPLES_PER_FRAME_MPEG2 = 576
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] } as const

// Audio players get the duration from the file header; do the same instead of buffering audio.
export function readMp3DurationMs(audio: Uint8Array, totalAudioBytes: number): number {
  const frame = findFrameSync(audio)
  if (frame < 0) return 0
  const header = readFrameHeader(audio, frame)
  if (!header) return 0
  const xingFrames = readXingFrames(audio, frame, header.version, header.channelMode)
  if (xingFrames > 0) return Math.round((xingFrames * header.samplesPerFrame / header.sampleRate) * 1000)
  if (!header.bitrate || totalAudioBytes <= frame) return 0
  return Math.round(((totalAudioBytes - frame) * 8 / (header.bitrate * 1000)) * 1000)
}

// FLAC STREAMINFO packs sample rate and total samples into the first metadata block.
export function readFlacDurationMs(bytes: Uint8Array): number {
  if (bytes.byteLength < 4 + 4 + 18 || bytes[0] !== 0x66 || bytes[1] !== 0x4c) return 0
  const info = 8
  const sampleRate = ((bytes[info + 10]! << 12) | (bytes[info + 11]! << 4) | (bytes[info + 12]! >> 4)) & 0xfffff
  const totalSamples = ((bytes[info + 13]! & 0x0f) * 2 ** 32)
    + (bytes[info + 14]! * 2 ** 24) + (bytes[info + 15]! * 2 ** 16) + (bytes[info + 16]! * 2 ** 8) + bytes[info + 17]!
  if (!sampleRate || !totalSamples) return 0
  return Math.round((totalSamples / sampleRate) * 1000)
}

function findFrameSync(bytes: Uint8Array): number {
  for (let index = 0; index + 4 < bytes.byteLength; index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1]! & 0xe0) === 0xe0) return index
  }
  return -1
}

function readFrameHeader(bytes: Uint8Array, offset: number): {
  version: number
  bitrate: number
  sampleRate: number
  samplesPerFrame: number
  channelMode: number
} | null {
  const b1 = bytes[offset + 1]!
  const b2 = bytes[offset + 2]!
  const b3 = bytes[offset + 3]!
  const versionBits = (b1 >> 3) & 0x03
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : versionBits === 0 ? 2.5 : 0
  if (!version) return null
  const bitrateIndex = (b2 >> 4) & 0x0f
  const sampleRateIndex = (b2 >> 2) & 0x03
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null
  const table = version === 1 ? BITRATES_V1_L3 : BITRATES_V2_L3
  return {
    version,
    bitrate: table[bitrateIndex] ?? 0,
    sampleRate: SAMPLE_RATES[version as 1 | 2 | 2.5][sampleRateIndex] ?? 0,
    samplesPerFrame: version === 1 ? SAMPLES_PER_FRAME_MPEG1 : SAMPLES_PER_FRAME_MPEG2,
    channelMode: (b3 >> 6) & 0x03,
  }
}

function readXingFrames(bytes: Uint8Array, frame: number, version: number, channelMode: number): number {
  const sideInfo = version === 1 ? (channelMode === 3 ? 17 : 32) : (channelMode === 3 ? 9 : 17)
  const tag = frame + 4 + sideInfo
  if (tag + 12 > bytes.byteLength) return 0
  const id = String.fromCharCode(bytes[tag]!, bytes[tag + 1]!, bytes[tag + 2]!, bytes[tag + 3]!)
  if (id !== 'Xing' && id !== 'Info') return 0
  const flags = ((bytes[tag + 4]! << 24) | (bytes[tag + 5]! << 16) | (bytes[tag + 6]! << 8) | bytes[tag + 7]!) >>> 0
  if (!(flags & 0x01)) return 0
  return ((bytes[tag + 8]! << 24) | (bytes[tag + 9]! << 16) | (bytes[tag + 10]! << 8) | bytes[tag + 11]!) >>> 0
}
