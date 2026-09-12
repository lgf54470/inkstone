import { musicStreamUrl } from '../../lib/api'
import { coverDataUrlFromBytes, coverDataUrlFromFrame, readEmbeddedLyrics, readTagSize } from './music-cover'
import { readFlacDurationMs, readMp3DurationMs } from './music-duration'
import { isFlac, readFlacMetadata } from './music-flac'
import { findMp4Box, isMp4, readMp4Cover, readMp4DurationMs, readMp4Lyrics, type Mp4Box } from './music-mp4'

const ID3_HEADER_BYTES = 10
const CHUNK_BYTES = 256 * 1024
const FLAC_WINDOW_BYTES = 64 * 1024
const FLAC_WINDOW_ATTEMPTS = 3
const MP3_AUDIO_WINDOW_BYTES = 8 * 1024
const MP4_WINDOW_BYTES = 512 * 1024
const MAX_TAG_BYTES = 6 * 1024 * 1024
const SCAN_TIMEOUT_MS = 25_000
const SCAN_ATTEMPTS = 3
const FLAC_MIME = 'audio/flac'

export interface TrackProbe {
  id: string
  sizeBytes: number
  mime: string
}

interface TagScan {
  coverDataUrl: string | null
  lyric: string | null
}

export interface ScannedMetadata extends TagScan {
  durationMs: number
}

const NO_TAGS: TagScan = { coverDataUrl: null, lyric: null }

// Only the tag is downloaded: an ID3 header reveals its size, FLAC blocks are walked in place.
export async function scanTrackMetadata(track: TrackProbe): Promise<ScannedMetadata> {
  const head = await fetchRange(track.id, 0, ID3_HEADER_BYTES - 1)
  if (!head) return { ...NO_TAGS, durationMs: 0 }
  if (isFlac(head)) return (await scanFlacTrack(track.id, 0)) ?? { ...NO_TAGS, durationMs: 0 }
  if (isMp4(head)) return scanMp4Track(track)
  const tagSize = readTagSize(head)
  // A few FLAC files carry a legacy ID3 tag, so the block walk has to start after it.
  if (tagSize > 0 && track.mime === FLAC_MIME) {
    const flac = await scanFlacTrack(track.id, tagSize + ID3_HEADER_BYTES)
    if (flac) return flac
  }
  const tags = tagSize > 0 ? await readId3Tags(track.id, tagSize) : NO_TAGS
  return { coverDataUrl: tags.coverDataUrl, lyric: tags.lyric, durationMs: await scanMp3Duration(track.id, tagSize, track.sizeBytes) }
}

// Duration alone needs no artwork, so the caller can skip downloading the whole tag.
export async function probeTrackDuration(track: TrackProbe): Promise<number> {
  if (track.sizeBytes <= 0) return 0
  const head = await fetchRange(track.id, 0, ID3_HEADER_BYTES - 1)
  if (!head) return 0
  if (isFlac(head)) return readFlacWindowDuration(track.id, 0)
  if (isMp4(head)) {
    const moov = await readMoovBox(track)
    return moov ? readMp4DurationMs(moov) : 0
  }
  const tagSize = readTagSize(head)
  if (tagSize > 0 && track.mime === FLAC_MIME) {
    const flacMs = await readFlacWindowDuration(track.id, tagSize + ID3_HEADER_BYTES)
    if (flacMs > 0) return flacMs
  }
  return scanMp3Duration(track.id, tagSize, track.sizeBytes)
}

async function readFlacWindowDuration(trackId: string, start: number): Promise<number> {
  const window = await fetchRange(trackId, start, start + FLAC_WINDOW_BYTES - 1)
  return window ? readFlacDurationMs(window) : 0
}

// Artwork can reach several megabytes inside one tag, so the tag is streamed and parsing
// stops as soon as the picture and lyrics are complete instead of waiting for the whole tag.
async function readId3Tags(trackId: string, tagSize: number): Promise<TagScan> {
  const limit = Math.min(tagSize + ID3_HEADER_BYTES, MAX_TAG_BYTES)
  let bytes = await fetchRange(trackId, 0, Math.min(CHUNK_BYTES, limit) - 1)
  if (!bytes) return NO_TAGS
  for (;;) {
    const coverDataUrl = await coverDataUrlFromBytes(bytes)
    const lyric = readEmbeddedLyrics(bytes)
    const next = bytes.byteLength >= limit || coverDataUrl || lyric
      ? null
      : await fetchRange(trackId, bytes.byteLength, Math.min(bytes.byteLength + CHUNK_BYTES, limit) - 1)
    if (!next || next.byteLength === 0) return { coverDataUrl, lyric }
    bytes = concatBytes(bytes, next)
  }
}

// The first audio frame carries the bitrate, and usually a Xing/Info frame count for VBR files.
async function scanMp3Duration(trackId: string, tagSize: number, totalBytes: number): Promise<number> {
  const audioStart = tagSize > 0 ? tagSize + ID3_HEADER_BYTES : 0
  if (totalBytes <= audioStart) return 0
  const audio = await fetchRange(trackId, audioStart, audioStart + MP3_AUDIO_WINDOW_BYTES - 1)
  if (!audio || audio.byteLength < 4) return 0
  return readMp3DurationMs(audio, totalBytes - audioStart)
}

// Returns null when the bytes are not FLAC after all, so the caller can try the ID3 path.
async function scanFlacTrack(trackId: string, start: number): Promise<ScannedMetadata | null> {
  let window = await fetchRange(trackId, start, start + FLAC_WINDOW_BYTES - 1)
  if (!window || !isFlac(window)) return null
  let scanned = readFlacMetadata(window)
  // Blocks arrive in order, so a large comment or padding block can hide the picture.
  for (let attempt = 0; attempt < FLAC_WINDOW_ATTEMPTS; attempt += 1) {
    if (scanned.neededBytes <= window.byteLength || scanned.neededBytes > MAX_TAG_BYTES) break
    const larger = await fetchChunked(trackId, start, start + scanned.neededBytes - 1)
    if (!larger || !isFlac(larger)) break
    window = larger
    scanned = readFlacMetadata(window)
  }
  return {
    coverDataUrl: scanned.cover ? await coverDataUrlFromFrame(scanned.cover) : null,
    lyric: scanned.lyric,
    durationMs: readFlacDurationMs(window),
  }
}

async function scanMp4Track(track: TrackProbe): Promise<ScannedMetadata> {
  const moov = await readMoovBox(track)
  if (!moov) return { ...NO_TAGS, durationMs: 0 }
  const cover = readMp4Cover(moov)
  return {
    coverDataUrl: cover ? await coverDataUrlFromFrame(cover) : null,
    lyric: readMp4Lyrics(moov),
    durationMs: readMp4DurationMs(moov),
  }
}

// The movie box sits at the head in most files, but some muxers append it at the end.
async function readMoovBox(track: TrackProbe): Promise<Uint8Array | null> {
  const headEnd = Math.min(track.sizeBytes, MP4_WINDOW_BYTES) - 1
  const head = await fetchChunked(track.id, 0, headEnd)
  const atHead = head ? findMp4Box(head, 0, head.byteLength, 'moov') : null
  if (head && atHead) return readBoxBytes(track, 0, head, atHead)
  const tailStart = Math.max(0, track.sizeBytes - MP4_WINDOW_BYTES)
  const tail = await fetchChunked(track.id, tailStart, track.sizeBytes - 1)
  const atTail = tail ? findMp4Box(tail, 0, tail.byteLength, 'moov') : null
  return tail && atTail ? readBoxBytes(track, tailStart, tail, atTail) : null
}

async function readBoxBytes(track: TrackProbe, windowStart: number, window: Uint8Array, box: Mp4Box): Promise<Uint8Array> {
  if (box.end <= windowStart + window.byteLength) return window.subarray(box.header - windowStart, box.end - windowStart)
  return (await fetchChunked(track.id, box.header, box.end - 1)) ?? window.subarray(box.header - windowStart)
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.byteLength + right.byteLength)
  merged.set(left, 0)
  merged.set(right, left.byteLength)
  return merged
}

// One long range can outlive the timeout on a slow remote, so large spans arrive in chunks.
async function fetchChunked(trackId: string, start: number, end: number): Promise<Uint8Array | null> {
  let bytes: Uint8Array | null = null
  let offset = start
  while (offset <= end) {
    const chunk = await fetchRange(trackId, offset, Math.min(offset + CHUNK_BYTES - 1, end))
    if (!chunk || chunk.byteLength === 0) break
    bytes = bytes ? concatBytes(bytes, chunk) : chunk
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchRange(trackId: string, start: number, end: number): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < SCAN_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(musicStreamUrl(trackId), {
        headers: { Range: 'bytes=' + start + '-' + end },
        signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
      })
      if (response.ok) return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      console.warn('[inkstone] music metadata scan failed:', error)
    }
  }
  return null
}
