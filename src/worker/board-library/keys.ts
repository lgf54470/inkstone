import { LIMITS } from '@shared/constants'
import type { AttachmentObjectStorage } from '../attachments/keys'
import { ApiError } from '../lib/errors'

/**
 * Object layout for whiteboard libraries: `<prefix>/<account>/<name>.json`, one object per
 * named library, so what the user calls a library is exactly what the bucket holds.
 */
export const BOARD_LIBRARY_PREFIX = 'excalidraw_library'

/** Names the object kind in its stored metadata, next to the attachment kinds. */
export const BOARD_LIBRARY_OBJECT_ID = 'board-library'

/** A name may not forge a path segment or carry control characters. */
const INVALID_NAME = /[/\\\u0000-\u001f\u007f]/

export function boardLibraryObjectKey(userId: string, name: string): string {
  return `${BOARD_LIBRARY_PREFIX}/${userId}/${name}.json`
}

/** The name as stored: trimmed, non-empty, and safe as an object key segment. */
export function boardLibraryName(value: unknown): string {
  if (typeof value !== 'string') throw ApiError.badRequest('name: expected a library name')
  const name = value.trim()
  if (!name) throw ApiError.badRequest('name: a library needs a name')
  if (name.length > LIMITS.boardLibraryNameMaxLength)
    throw ApiError.badRequest(`name: at most ${LIMITS.boardLibraryNameMaxLength} characters`)
  if (INVALID_NAME.test(name)) throw ApiError.badRequest('name: not a usable library name')
  return name
}

export interface BoardLibraryRow {
  name: string
  storage: AttachmentObjectStorage
  object_key: string
  updated_at: number
}

export interface BoardLibraryListRow {
  name: string
  size: number
  updated_at: number
}
