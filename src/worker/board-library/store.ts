/**
 * Reading and writing an account's named whiteboard libraries.
 *
 * Each library is one JSON document — `.excalidrawlib`, the format the library exports and
 * installs, is JSON rather than an archive — kept as an object next to the attachments
 * while D1 holds one row per name with its size and hash. That way a library can grow
 * without crowding a row, listing is a single query, and a re-save of identical content
 * costs one row update instead of an object rewrite (the boards save on every change).
 */
import { LIMITS } from '@shared/constants'
import type { BoardLibrarySnapshot, BoardLibrarySummary } from '@shared/types'
import {
  deleteAttachmentObjects,
  hasAttachmentStorage,
  putAttachmentObject,
  readAttachmentObject,
  selectAttachmentStorage,
} from '../attachments/backend'
import type { AttachmentObjectStorage } from '../attachments/keys'
import type { Env } from '../env'
import { sha256Hex } from '../lib/encoding'
import { ApiError } from '../lib/errors'
import {
  BOARD_LIBRARY_OBJECT_ID,
  boardLibraryObjectKey,
  type BoardLibraryListRow,
  type BoardLibraryRow,
} from './keys'

const BOARD_LIBRARY_MIME = 'application/json'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function requireStorage(env: Env): AttachmentObjectStorage {
  const storage = selectAttachmentStorage(env)
  if (!storage)
    throw new ApiError(503, 'storage_unavailable', 'Whiteboard library storage is not configured')
  return storage
}

/** Rejects what the API should not have accepted: junk, or a library past the cap. */
export function assertBoardLibraryItems(items: string): void {
  const bytes = encoder.encode(items).byteLength
  if (bytes > LIMITS.boardLibraryMaxBytes)
    throw ApiError.tooLarge(`The whiteboard library exceeds the ${Math.round(LIMITS.boardLibraryMaxBytes / (1024 * 1024))} MB limit`)
  try {
    if (!Array.isArray(JSON.parse(items))) throw new Error('not an array')
  } catch {
    throw ApiError.badRequest('items: expected a JSON array of library items')
  }
}

/**
 * Reads the object from the backend the row names, falling back to the one this instance
 * has configured: an instance that gained (or lost) its R2 bucket must still find the
 * libraries that were written before the switch.
 */
async function readStoredObject(env: Env, row: BoardLibraryRow): Promise<Uint8Array | null> {
  const configured = selectAttachmentStorage(env)
  const candidates: AttachmentObjectStorage[] = configured && configured !== row.storage ? [row.storage, configured] : [row.storage]
  for (const storage of candidates) {
    if (!hasAttachmentStorage(env, storage)) continue
    const bytes = await readAttachmentObject(env, storage, row.object_key)
    if (bytes) return bytes
  }
  return null
}

function summaryOf(row: BoardLibraryListRow): BoardLibrarySummary {
  return { name: row.name, size: row.size, updatedAt: row.updated_at }
}

/** Every library the account owns, by name, so the picker can list them without objects. */
export async function listBoardLibraries(db: D1Database, userId: string): Promise<BoardLibrarySummary[]> {
  const { results } = await db
    .prepare('SELECT name, size, updated_at FROM board_library WHERE user_id = ?1 ORDER BY name COLLATE NOCASE')
    .bind(userId)
    .all<BoardLibraryListRow>()
  return (results ?? []).map(summaryOf)
}

export async function readBoardLibrary(
  env: Env,
  db: D1Database,
  userId: string,
  name: string,
): Promise<BoardLibrarySnapshot> {
  const row = await db
    .prepare('SELECT name, storage, object_key, updated_at FROM board_library WHERE user_id = ?1 AND name = ?2')
    .bind(userId, name)
    .first<BoardLibraryRow>()
  if (!row) return { name, items: null, updatedAt: 0 }
  const bytes = await readStoredObject(env, row)
  return { name, items: bytes ? decoder.decode(bytes) : null, updatedAt: row.updated_at }
}

export async function writeBoardLibrary(
  env: Env,
  db: D1Database,
  userId: string,
  name: string,
  items: string,
): Promise<BoardLibrarySnapshot> {
  assertBoardLibraryItems(items)
  const storage = requireStorage(env)
  const key = boardLibraryObjectKey(userId, name)
  const hash = await sha256Hex(items)
  const previous = await db
    .prepare('SELECT name, storage, object_key, sha256 FROM board_library WHERE user_id = ?1 AND name = ?2')
    .bind(userId, name)
    .first<Pick<BoardLibraryRow, 'name' | 'storage' | 'object_key'> & { sha256: string }>()
  const metadata = {
    userId,
    objectId: BOARD_LIBRARY_OBJECT_ID,
    kind: 'board-library' as const,
    filename: `${name}.json`,
    mime: BOARD_LIBRARY_MIME,
    sha256: hash,
  }
  if (!previous || previous.sha256 !== hash || previous.storage !== storage) {
    const bytes = encoder.encode(items)
    await putAttachmentObject(env, storage, key, bytes, metadata)
    // A library that moved between R2 and KV (or was renamed onto a new key) leaves one
    // object behind; writing in place means that is the only orphan this feature can make.
    if (previous && (previous.storage !== storage || previous.object_key !== key) && hasAttachmentStorage(env, previous.storage))
      await deleteAttachmentObjects(env, previous.storage, [previous.object_key])
  }
  const updatedAt = Date.now()
  await db
    .prepare(
      `INSERT INTO board_library (user_id, name, storage, object_key, size, sha256, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(user_id, name) DO UPDATE SET
         storage = excluded.storage,
         object_key = excluded.object_key,
         size = excluded.size,
         sha256 = excluded.sha256,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, name, storage, key, encoder.encode(items).byteLength, hash, updatedAt)
    .run()
  return { name, items, updatedAt }
}

/** Drops a library and its object; the caller decides what a board falls back to. */
export async function removeBoardLibrary(
  env: Env,
  db: D1Database,
  userId: string,
  name: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT name, storage, object_key, updated_at FROM board_library WHERE user_id = ?1 AND name = ?2')
    .bind(userId, name)
    .first<BoardLibraryRow>()
  if (!row) return false
  if (hasAttachmentStorage(env, row.storage)) await deleteAttachmentObjects(env, row.storage, [row.object_key])
  await db.prepare('DELETE FROM board_library WHERE user_id = ?1 AND name = ?2').bind(userId, name).run()
  return true
}
