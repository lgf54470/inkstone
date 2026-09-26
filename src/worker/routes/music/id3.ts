import { readCoverBytes, coverMimeFor } from './cover'
import type { Env } from '../../env'
import type { AttachmentObjectStorage } from '../../attachments/keys'
import { requireMusicStorage } from './storage'

// FEA-D1: mp3 downloads carry an ID3v2.3 tag with the library's metadata. The tag is
// PREPENDED to the existing bytes rather than rewriting them: players read the first
// tag they find, so a tag the file already had simply loses the fight, and the audio
// stream itself stays untouched. Text uses UTF-16 with BOM (encoding 0x01), the
// most widely decoded choice the v2.3 spec allows.
const TAG_HEADER_SIZE = 10
const FRAME_HEADER_SIZE = 10

export interface DownloadTagSource {
  title: string
  artist: string
  album: string
  lyric: string | null
  coverKey: string | null
}

interface Frame {
  id: string
  body: Uint8Array[]
}

export async function buildDownloadTag(env: Env, source: DownloadTagSource): Promise<Uint8Array | null> {
  const frames: Frame[] = []
  const pushText = (id: string, value: string | null): void => {
    if (!value) return
    frames.push({ id, body: [textFramePayload(value)] })
  }
  pushText('TIT2', source.title)
  pushText('TPE1', source.artist)
  pushText('TALB', source.album)

  if (source.lyric) {
    frames.push({ id: 'USLT', body: [lyricsFramePayload(source.lyric)] })
  }

  const cover = source.coverKey ? await readCover(env, source) : null
  if (cover) {
    frames.push({ id: 'APIC', body: [apicPayload(cover.mime, cover.bytes)] })
  }

  if (!frames.length) return null

  const bodies = frames.map((frame) => frameBody(frame))
  const bodyLength = bodies.reduce((total, bytes) => total + bytes.length, 0)
  const tag = new Uint8Array(TAG_HEADER_SIZE + bodyLength)
  tag.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00])
  writeSynchsafe(tag, TAG_HEADER_SIZE - 4, bodyLength)
  let offset = TAG_HEADER_SIZE
  for (const body of bodies) {
    tag.set(body, offset)
    offset += body.length
  }
  return tag
}

interface CoverBytes {
  mime: string
  bytes: Uint8Array
}

async function readCover(env: Env, source: DownloadTagSource): Promise<CoverBytes | null> {
  const storage: AttachmentObjectStorage = requireMusicStorage(env)
  const bytes = await readCoverBytes(env, storage, source.coverKey!).catch(() => null)
  if (!bytes) return null
  return { mime: coverMimeFor(source.coverKey!), bytes }
}

function frameBody(frame: Frame): Uint8Array {
  const length = frame.body.reduce((total, part) => total + part.length, 0)
  const body = new Uint8Array(FRAME_HEADER_SIZE + length)
  for (let index = 0; index < 4; index += 1) {
    body[index] = frame.id.charCodeAt(index)
  }
  // v2.3 frame sizes are plain big-endian 32-bit, unlike the synchsafe tag size.
  body[4] = (length >>> 24) & 0xff
  body[5] = (length >>> 16) & 0xff
  body[6] = (length >>> 8) & 0xff
  body[7] = length & 0xff
  let offset = FRAME_HEADER_SIZE
  for (const part of frame.body) {
    body.set(part, offset)
    offset += part.length
  }
  return body
}

// Text frames: encoding 0x01 (UTF-16 with BOM) + the UTF-16LE text + its NUL.
function textFramePayload(text: string): Uint8Array {
  return concat([new Uint8Array([0x01]), utf16le(text)])
}

// USLT: encoding + 3-letter language + an empty descriptor (UTF-16 NUL) + the text.
// The lyric text is stored as-is — LRC timestamps stay, players that parse them win.
function lyricsFramePayload(text: string): Uint8Array {
  return concat([
    new Uint8Array([0x01]),
    new TextEncoder().encode('chi'),
    new Uint8Array([0x00, 0x00]),
    utf16le(text),
  ])
}

function utf16le(text: string): Uint8Array {
  const bomAndText = new Uint8Array(2 + text.length * 2 + 2)
  bomAndText[0] = 0xff
  bomAndText[1] = 0xfe
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    bomAndText[2 + index * 2] = unit & 0xff
    bomAndText[3 + index * 2] = unit >> 8
  }
  return bomAndText
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function apicPayload(mime: string, bytes: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(`${mime}\0`)
  // Encoding 0x00 (latin1) header fields, picture type 0x03 = front cover, an empty
  // latin1 description (single NUL), then the raw image bytes.
  const fixed = new Uint8Array([0x00, ...head, 0x03, 0x00])
  const payload = new Uint8Array(fixed.length + bytes.length)
  payload.set(fixed)
  payload.set(bytes, fixed.length)
  return payload
}

// The tag size is a synchsafe integer: 28 bits spread over 4 bytes, one stop bit each.
function writeSynchsafe(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 21) & 0x7f
  target[offset + 1] = (value >>> 14) & 0x7f
  target[offset + 2] = (value >>> 7) & 0x7f
  target[offset + 3] = value & 0x7f
}
