import { ApiError } from './errors'
import { isValidId, newId } from './id'

/**
 * Scoped folder/tag CRUD shared by the "hub" organizer stacks (attachment
 * drive, share center, blog). Each hub keeps its own tables
 * (`*_folders` / `*_tags`) and its own detach target, but the row shape,
 * defaults and ordering rules are identical, so a single implementation
 * replaces the three near-copy route sections.
 *
 * The notes `folders`/`tags` tables are intentionally NOT routed through this
 * module: they carry note-specific semantics (nested depth limits, concurrent
 * guarded soft-delete, note-content tag rewrites with rollback, the changes
 * log) that a shared simple engine cannot express without distortion.
 */

export const HUB_FOLDER_TABLES = ['attachment_folders', 'share_folders', 'blog_folders'] as const
export type HubFolderTable = (typeof HUB_FOLDER_TABLES)[number]

export const HUB_TAG_TABLES = ['attachment_tags', 'share_tags', 'blog_tags'] as const
export type HubTagTable = (typeof HUB_TAG_TABLES)[number]

/** Entity table whose rows carry `folder_id` and are detached when a hub folder is deleted. */
export const HUB_FOLDER_CHILD_TABLES = ['attachments', 'shares', 'blog_posts'] as const
export type HubFolderChildTable = (typeof HUB_FOLDER_CHILD_TABLES)[number]

export interface ScopedFolder {
  id: string
  userId: string
  parentId: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface ScopedTag {
  id: string
  userId: string
  name: string
  color: string | null
  isPinned: boolean
  createdAt: number
}

const FOLDER_NAME_MAX = 100
const TAG_NAME_MAX = 50
const FOLDER_NOT_FOUND = 'Folder not found'
const TAG_NOT_FOUND = 'Tag not found'
const TAG_NAME_REQUIRED = 'Tag name is required'

const FOLDER_COLUMNS =
  'id, user_id, parent_id, name, icon, color, position, created_at, updated_at'
const TAG_COLUMNS = 'id, user_id, name, color, is_pinned, created_at'

interface FolderRow {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  created_at: number
  updated_at: number
}

interface TagRow {
  id: string
  user_id: string
  name: string
  color: string | null
  is_pinned: number
  created_at: number
}

function toScopedFolder(row: FolderRow): ScopedFolder {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toScopedTag(row: TagRow): ScopedTag {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
  }
}

function folderName(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, FOLDER_NAME_MAX)
    : 'New Folder'
}

function tagName(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, TAG_NAME_MAX)
    : ''
}

export async function listScopedFolders(
  db: D1Database,
  table: HubFolderTable,
  userId: string,
): Promise<ScopedFolder[]> {
  const { results } = await db
    .prepare(
      `SELECT ${FOLDER_COLUMNS}
         FROM ${table} WHERE user_id = ?1 ORDER BY position ASC, created_at ASC`,
    )
    .bind(userId)
    .all<FolderRow>()
  return results.map(toScopedFolder)
}

export interface ScopedFolderInput {
  id?: string
  name?: string
  parentId?: string | null
  color?: string | null
  icon?: string | null
  position?: number
}

export async function createScopedFolder(
  db: D1Database,
  table: HubFolderTable,
  userId: string,
  body: ScopedFolderInput,
): Promise<ScopedFolder> {
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const name = folderName(body.name)
  const parentId = body.parentId && isValidId(body.parentId) ? body.parentId : null
  const now = Date.now()
  const position = typeof body.position === 'number' ? body.position : now

  await db
    .prepare(
      `INSERT INTO ${table} (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(id, userId, parentId, name, body.icon ?? null, body.color ?? null, position, now, now)
    .run()

  return {
    id,
    userId,
    parentId,
    name,
    icon: body.icon ?? null,
    color: body.color ?? null,
    position,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateScopedFolder(
  db: D1Database,
  table: HubFolderTable,
  userId: string,
  id: string,
  body: ScopedFolderInput,
): Promise<ScopedFolder> {
  if (!isValidId(id)) throw ApiError.notFound(FOLDER_NOT_FOUND)
  const existing = await db
    .prepare(
      `SELECT ${FOLDER_COLUMNS} FROM ${table} WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(id, userId)
    .first<FolderRow>()
  if (!existing) throw ApiError.notFound(FOLDER_NOT_FOUND)

  const nextName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, FOLDER_NAME_MAX)
      : existing.name
  const nextParent =
    body.parentId !== undefined
      ? (body.parentId && isValidId(body.parentId) ? body.parentId : null)
      : existing.parent_id
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextIcon = body.icon !== undefined ? body.icon : existing.icon
  const nextPosition = typeof body.position === 'number' ? body.position : existing.position
  const now = Date.now()

  await db
    .prepare(
      `UPDATE ${table} SET name = ?1, parent_id = ?2, color = ?3, icon = ?4, position = ?5, updated_at = ?6
       WHERE id = ?7 AND user_id = ?8`,
    )
    .bind(nextName, nextParent, nextColor, nextIcon, nextPosition, now, id, userId)
    .run()

  return {
    id,
    userId,
    parentId: nextParent,
    name: nextName,
    icon: nextIcon,
    color: nextColor,
    position: nextPosition,
    createdAt: existing.created_at,
    updatedAt: now,
  }
}

/**
 * Deletes a hub folder: children in `childTable` and nested hub folders are
 * detached (moved to the root) before the row is removed. Mirrors the old
 * three-statement batch; returns `false` when the id does not exist.
 */
export async function deleteScopedFolder(
  db: D1Database,
  table: HubFolderTable,
  childTable: HubFolderChildTable,
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isValidId(id)) throw ApiError.notFound(FOLDER_NOT_FOUND)
  const outcome = await db.batch([
    db.prepare(
      `UPDATE ${childTable} SET folder_id = NULL WHERE folder_id = ?1 AND user_id = ?2`,
    ).bind(id, userId),
    db.prepare(
      `UPDATE ${table} SET parent_id = NULL WHERE parent_id = ?1 AND user_id = ?2`,
    ).bind(id, userId),
    db.prepare(`DELETE FROM ${table} WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
  ])
  return Boolean(outcome.at(-1)?.meta.changes)
}

export async function listScopedTags(
  db: D1Database,
  table: HubTagTable,
  userId: string,
): Promise<ScopedTag[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TAG_COLUMNS}
         FROM ${table} WHERE user_id = ?1 ORDER BY is_pinned DESC, name ASC`,
    )
    .bind(userId)
    .all<TagRow>()
  return results.map(toScopedTag)
}

export interface ScopedTagInput {
  id?: string
  name?: string
  color?: string | null
  isPinned?: boolean
}

export type ScopedTagConflictMode = 'upsert' | 'keep-existing'

export async function createScopedTag(
  db: D1Database,
  table: HubTagTable,
  conflictMode: ScopedTagConflictMode,
  userId: string,
  body: ScopedTagInput,
): Promise<{ tag: ScopedTag; status: 200 | 201 }> {
  const name = tagName(body.name)
  if (!name) throw ApiError.badRequest(TAG_NAME_REQUIRED)
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const now = Date.now()
  const color = body.color ?? null

  if (conflictMode === 'upsert') {
    await db
      .prepare(
        `INSERT INTO ${table} (id, user_id, name, color, is_pinned, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)
         ON CONFLICT(user_id, name) DO UPDATE SET color = COALESCE(?4, color)`,
      )
      .bind(id, userId, name, color, now)
      .run()
    const row = await db
      .prepare(`SELECT ${TAG_COLUMNS} FROM ${table} WHERE user_id = ?1 AND name = ?2`)
      .bind(userId, name)
      .first<TagRow>()
    return { tag: row ? toScopedTag(row) : { id, userId, name, color, isPinned: false, createdAt: now }, status: 201 }
  }

  try {
    await db
      .prepare(
        `INSERT INTO ${table} (id, user_id, name, color, is_pinned, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)`,
      )
      .bind(id, userId, name, color, now)
      .run()
    return {
      tag: { id, userId, name, color, isPinned: false, createdAt: now },
      status: 201,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('UNIQUE') || message.includes('constraint')) {
      const existing = await db
        .prepare(`SELECT ${TAG_COLUMNS} FROM ${table} WHERE user_id = ?1 AND name = ?2`)
        .bind(userId, name)
        .first<TagRow>()
      if (existing) return { tag: toScopedTag(existing), status: 200 }
    }
    throw err
  }
}

export async function updateScopedTag(
  db: D1Database,
  table: HubTagTable,
  userId: string,
  id: string,
  body: ScopedTagInput,
): Promise<{ tag: ScopedTag; previousName: string }> {
  if (!isValidId(id)) throw ApiError.notFound(TAG_NOT_FOUND)
  const existing = await db
    .prepare(`SELECT ${TAG_COLUMNS} FROM ${table} WHERE id = ?1 AND user_id = ?2`)
    .bind(id, userId)
    .first<TagRow>()
  if (!existing) throw ApiError.notFound(TAG_NOT_FOUND)

  const nextName = body.name !== undefined
    ? (tagName(body.name) || existing.name)
    : existing.name
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextPinned =
    body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned

  await db
    .prepare(
      `UPDATE ${table} SET name = ?1, color = ?2, is_pinned = ?3 WHERE id = ?4 AND user_id = ?5`,
    )
    .bind(nextName, nextColor, nextPinned, id, userId)
    .run()

  return {
    tag: {
      id,
      userId,
      name: nextName,
      color: nextColor,
      isPinned: Boolean(nextPinned),
      createdAt: existing.created_at,
    },
    previousName: existing.name,
  }
}

/** Deletes a tag row; returns the deleted name so callers can clean up entity JSON tag lists. */
export async function deleteScopedTag(
  db: D1Database,
  table: HubTagTable,
  userId: string,
  id: string,
): Promise<{ removed: boolean; name: string | null }> {
  if (!isValidId(id)) throw ApiError.notFound(TAG_NOT_FOUND)
  const existing = await db
    .prepare(`SELECT name FROM ${table} WHERE id = ?1 AND user_id = ?2`)
    .bind(id, userId)
    .first<{ name: string }>()
  if (!existing) return { removed: false, name: null }
  await db.prepare(`DELETE FROM ${table} WHERE id = ?1 AND user_id = ?2`).bind(id, userId).run()
  return { removed: true, name: existing.name }
}
