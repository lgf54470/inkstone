import { hasAttachmentStorage, isAttachmentObjectStorage, readAttachmentObjectStreamForRow } from '../../attachments/backend'
import { NOTE_COLUMNS_FULL, type NoteRow } from '../../db/rows'
import type { Env } from '../../env'
import { sha256Hex } from '../../lib/encoding'
import { safeAttachmentMime } from '../../lib/image'
import { cancelStreamBestEffort } from '../../lib/streams'
// Snapshot payload types live here (not in build.ts) because build.ts imports
// the stream helpers from this module; owning the shared shapes here keeps the
// pair free of an import cycle.
export type BackupFileKind = 'note' | 'attachment' | 'readme' | 'manifest' | 'complete'

export interface BackupFile {
  path: string
  byteLength: number
  sha256: string
  contentType: string
  kind: BackupFileKind
  open: () => Promise<ReadableStream<Uint8Array>>
}

export interface AttachmentSnapshotRow {
  id: string
  user_id: string
  filename: string
  mime: string
  size: number
  sha256: string
  storage: string
  object_key: string | null
  created_at: number
}

export const encoder = new TextEncoder()

const ATTACHMENT_REFERENCE_RE =
  /\/api\/files\/([0-9a-hjkmnp-tv-z]{26})(?=$|[\s>)\]"'?#])/g

export function renderNoteBody(
  content: string,
  notePath: string,
  attachmentPaths: ReadonlyMap<string, string>,
  referencedIds: ReadonlySet<string>,
): string {
  return content.replace(ATTACHMENT_REFERENCE_RE, (match, id: string) => {
    if (!referencedIds.has(id)) return match
    const attachmentPath = attachmentPaths.get(id)
    return attachmentPath ? relativeBackupUrl(notePath, attachmentPath) : match
  })
}

export async function openPlannedNote(
  env: Env,
  userId: string,
  noteId: string,
  expectedRev: number,
  notePath: string,
  expectedSha256: string,
  attachmentPaths: ReadonlyMap<string, string>,
  referencedIds: ReadonlySet<string>,
): Promise<ReadableStream<Uint8Array>> {
  const row = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n
      WHERE n.user_id = ?1 AND n.id = ?2 AND n.rev = ?3`,
  ).bind(userId, noteId, expectedRev).first<NoteRow>()
  if (!row) throw new Error(`A note changed while the backup was running: ${noteId}`)
  const bytes = encoder.encode(renderNoteBody(row.content, notePath, attachmentPaths, referencedIds))
  if ((await sha256Hex(bytes)) !== expectedSha256) {
    throw new Error(`A note changed while the backup was running: ${row.title}`)
  }
  return streamBytes(bytes)
}

export async function openVerifiedAttachment(
  env: Env,
  row: AttachmentSnapshotRow,
): Promise<ReadableStream<Uint8Array>> {
  const storage = row.storage
  if (!isAttachmentObjectStorage(storage) || !hasAttachmentStorage(env, storage)) {
    throw new Error(`Attachment storage is unavailable: ${row.filename}`)
  }
  const object = await readAttachmentObjectStreamForRow(env, { ...row, storage })
  if (!object) throw new Error(`Attachment data is missing: ${row.filename}`)
  if (object.size !== null && object.size !== row.size) {
    await cancelStreamBestEffort(object.body)
    throw new Error(`Attachment checksum does not match: ${row.filename}`)
  }
  if (object.metadata?.sha256 && object.metadata.sha256 !== row.sha256) {
    await cancelStreamBestEffort(object.body)
    throw new Error(`Attachment checksum metadata does not match: ${row.filename}`)
  }
  if (object.metadata?.mime && object.metadata.mime !== row.mime) {
    await cancelStreamBestEffort(object.body)
    throw new Error(`Attachment type metadata does not match: ${row.filename}`)
  }
  return verifyAttachmentStream(object.body, row)
}

function verifyAttachmentStream(
  source: ReadableStream<Uint8Array>,
  row: AttachmentSnapshotRow,
): ReadableStream<Uint8Array> {
  const digest = new crypto.DigestStream('SHA-256')
  const digestWriter = digest.getWriter()
  const prefixLimit = 64 * 1024
  let prefix = new Uint8Array(0)
  let bytes = 0

  const fail = async (message: string): Promise<never> => {
    await cancelStreamBestEffort({ cancel: () => digestWriter.abort(message) })
    throw new Error(message)
  }

  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > row.size) await fail(`Attachment size does not match: ${row.filename}`)
      if (prefix.byteLength < prefixLimit) {
        const take = Math.min(prefixLimit - prefix.byteLength, chunk.byteLength)
        const next = new Uint8Array(prefix.byteLength + take)
        next.set(prefix)
        next.set(chunk.subarray(0, take), prefix.byteLength)
        prefix = next
      }
      await digestWriter.write(chunk)
      controller.enqueue(chunk)
    },
    async flush() {
      if (bytes !== row.size) await fail(`Attachment size does not match: ${row.filename}`)
      if (safeAttachmentMime(prefix, row.mime) !== row.mime) {
        await fail(`Attachment type metadata does not match: ${row.filename}`)
      }
      await digestWriter.close()
      const actual = bytesToHex(new Uint8Array(await digest.digest))
      if (actual !== row.sha256) {
        throw new Error(`Attachment checksum does not match: ${row.filename}`)
      }
    },
  }))
}

function streamBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function staticFile(
  path: string,
  text: string,
  contentType: string,
  kind: BackupFileKind,
): Promise<BackupFile> {
  const bytes = encoder.encode(text)
  return staticFileAsync(path, bytes, contentType, kind)
}

export async function staticFileAsync(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  kind: BackupFileKind,
): Promise<BackupFile> {
  const sha256 = await sha256Hex(bytes)
  return {
    path,
    byteLength: bytes.byteLength,
    sha256,
    contentType,
    kind,
    open: async () => streamBytes(bytes),
  }
}

function relativeBackupUrl(fromFile: string, toFile: string): string {
  const from = fromFile.split('/').slice(0, -1)
  const to = toFile.split('/')
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common++
  const parts = [
    ...Array.from({ length: from.length - common }, () => '..'),
    ...to.slice(common),
  ]
  return parts.map((part) => part === '..' ? part : encodeURIComponent(part)).join('/')
}
