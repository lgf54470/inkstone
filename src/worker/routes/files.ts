import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { LIMITS } from '@shared/constants'
import { extractAttachmentIds } from '@shared/markdown-utils'
import type { Attachment } from '@shared/types'
import {
  hasAttachmentStorage,
  readAttachmentObjectStream,
} from '../attachments/backend'
import { drainAttachmentCleanup } from '../attachments/cleanup'
import { getMeta, setMeta } from '../db/metadata'
import {
  attachmentCleanupTarget,
  attachmentObjectKey,
  legacyAttachmentObjectKey,
  type AttachmentObjectStorage,
} from '../attachments/keys'
import { persistAttachmentWithinQuota } from '../attachments/storage'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { isValidId, isValidSlug, newId } from '../lib/id'
import { isInlineSafe } from '../lib/image'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../lib/throttle'
import { shareAssetCookieName, verifyShareAssetSession } from '../lib/share-asset-session'
import { requireAuth } from '../middleware/auth'

export const filesRoutes = new Hono<AppBindings>()

interface AttachmentRow {
  id: string
  user_id: string
  note_id: string | null
  folder_id: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  storage: AttachmentObjectStorage
  is_starred: number
  is_pinned: number
  tags: string
  created_at: number
}

const ATTACHMENT_LIST_PAGE_SIZE = 500
const ATTACHMENT_SCAN_PAGE_SIZE = 100
const ATTACHMENT_REF_WRITE_CHUNK = 100
// The usage panel re-opens and re-pages often while note contents rarely
// change between opens; keep one exact reference map per user for a short
// window so page 2, filters and re-opens skip the full content scan.
// The cache lives in D1 (attachment_refs + an app_meta freshness stamp), so
// every isolate shares the rebuild instead of scanning all note bodies once
// per isolate within the window.
const ATTACHMENT_REFERENCE_CACHE_TTL_MS = 60_000

function attachmentRefMetaKey(userId: string): string {
  return `attachment-refs:${userId}`
}

async function readAttachmentReferenceCounts(
  db: D1Database,
  userId: string,
): Promise<Map<string, number>> {
  const meta = await getMeta(db, attachmentRefMetaKey(userId))
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as { at?: unknown }
      if (
        typeof parsed.at === 'number' &&
        Date.now() - parsed.at < ATTACHMENT_REFERENCE_CACHE_TTL_MS
      ) {
        const { results } = await db
          .prepare(`SELECT attachment_id, count FROM attachment_refs WHERE user_id = ?1`)
          .bind(userId)
          .all<{ attachment_id: string; count: number }>()
        const references = new Map<string, number>()
        for (const row of results) references.set(row.attachment_id, row.count)
        return references
      }
    } catch {
      // Corrupt stamp: fall through to a rebuild.
    }
  }
  const references = await collectAttachmentReferences(db, userId)
  await persistAttachmentReferenceCounts(db, userId, references)
  return references
}

async function persistAttachmentReferenceCounts(
  db: D1Database,
  userId: string,
  references: ReadonlyMap<string, number>,
): Promise<void> {
  // The freshness stamp is written last, so readers never observe a
  // half-rebuilt table: they only consult it when the stamp is fresh.
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM attachment_refs WHERE user_id = ?1`).bind(userId),
  ]
  for (const [attachmentId, count] of references) {
    statements.push(
      db.prepare(
        `INSERT OR REPLACE INTO attachment_refs (user_id, attachment_id, count)
         VALUES (?1, ?2, ?3)`,
      ).bind(userId, attachmentId, count),
    )
  }
  for (let index = 0; index < statements.length; index += ATTACHMENT_REF_WRITE_CHUNK) {
    await db.batch(statements.slice(index, index + ATTACHMENT_REF_WRITE_CHUNK))
  }
  await setMeta(db, attachmentRefMetaKey(userId), JSON.stringify({ at: Date.now() }))
}

function encodeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function parseAttachmentListCursor(value: string | undefined): { createdAt: number; id: string } | null {
  if (!value) return null
  const match = /^(\d{1,16})\.([0-9a-hjkmnp-tv-z]{26})$/.exec(value)
  const createdAt = Number(match?.[1])
  if (!match || !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw ApiError.badRequest('Invalid attachment cursor')
  }
  return { createdAt, id: match[2]! }
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    folderId: row.folder_id ?? null,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    url: `/api/files/${row.id}`,
    createdAt: row.created_at,
    isStarred: Boolean(row.is_starred),
    isPinned: Boolean(row.is_pinned),
    tags: parseTags(row.tags),
  }
}

async function collectAttachmentReferences(
  db: D1Database,
  userId: string,
  wantedIds?: ReadonlySet<string>,
  options: { earlyExit?: boolean } = {},
): Promise<Map<string, number>> {
  const references = new Map<string, number>()
  if (wantedIds?.size === 0) return references
  // When the caller only needs presence (e.g. pruning), stopping as soon as
  // every wanted id has been found is exact: unscanned notes could only add
  // more references for already-found ids, never create new ones.
  const earlyExit = options.earlyExit === true

  let afterId = ''
  while (true) {
    const { results } = await db.prepare(
      `SELECT id, content FROM notes
        WHERE user_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3`,
    ).bind(userId, afterId, ATTACHMENT_SCAN_PAGE_SIZE).all<{ id: string; content: string }>()
    if (!results.length) break

    for (const note of results) {
      for (const id of extractAttachmentIds(note.content)) {
        if (wantedIds && !wantedIds.has(id)) continue
        references.set(id, (references.get(id) ?? 0) + 1)
      }
    }
    if (earlyExit && wantedIds && references.size === wantedIds.size) break
    afterId = results[results.length - 1]!.id
    if (results.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  return references
}

async function collectAttachmentIdsThroughBoundary(
  db: D1Database,
  userId: string,
  boundary: { created_at: number; id: string },
): Promise<Set<string>> {
  const ids = new Set<string>()
  let cursor: { createdAt: number; id: string } | null = null
  while (true) {
    const query: D1PreparedStatement = cursor
      ? db.prepare(
          `SELECT created_at, id FROM attachments WHERE user_id = ?1
            AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
            AND (created_at > ?4 OR (created_at = ?4 AND id > ?5))
           ORDER BY created_at ASC, id ASC LIMIT ?6`,
        ).bind(
          userId,
          boundary.created_at,
          boundary.id,
          cursor.createdAt,
          cursor.id,
          ATTACHMENT_SCAN_PAGE_SIZE,
        )
      : db.prepare(
          `SELECT created_at, id FROM attachments WHERE user_id = ?1
            AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
           ORDER BY created_at ASC, id ASC LIMIT ?4`,
        ).bind(userId, boundary.created_at, boundary.id, ATTACHMENT_SCAN_PAGE_SIZE)
    const rows: Array<{ created_at: number; id: string }> = (await query.all<{
      created_at: number
      id: string
    }>()).results
    if (!rows.length) break
    for (const row of rows) ids.add(row.id)
    const last = rows[rows.length - 1]!
    cursor = { createdAt: last.created_at, id: last.id }
    if (rows.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  return ids
}


filesRoutes.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  try {
    await consumeAttemptBudget(c.env.DB, [{
      key: `attachment-upload:${userId}`,
      maxAttempts: LIMITS.attachmentUploadsPerHour,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many uploads. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }

  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.attachment)

  const file = form.get('file')
  if (!(file instanceof File)) throw ApiError.badRequest('Missing file field')

  if (file.size > LIMITS.attachmentMaxBytes) {
    throw ApiError.tooLarge('The file exceeds the 25 MB limit')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = newId()
  const rawNoteId = form.get('noteId')
  const noteId = typeof rawNoteId === 'string' && rawNoteId ? rawNoteId.slice(0, 128) : null
  const rawFolderId = form.get('folderId')
  let folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId.slice(0, 128) : null
  if (noteId) {
    const owned = await c.env.DB.prepare(
      `SELECT id FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
    )
      .bind(noteId, userId)
      .first<{ id: string }>()
    if (!owned) throw ApiError.badRequest('The associated note does not exist')
  }
  const now = Date.now()
  const stored = await persistAttachmentWithinQuota(c.env, {
    id,
    userId,
    noteId,
    folderId,
    filename: file.name || 'file',
    reportedMime: file.type,
    bytes,
    createdAt: now,
  })

  const attachment: Attachment = {
    id,
    noteId,
    folderId: stored.folderId ?? folderId,
    filename: stored.filename,
    mime: stored.mime,
    size: bytes.byteLength,
    width: stored.width,
    height: stored.height,
    url: `/api/files/${id}`,
    createdAt: now,
    isStarred: false,
    isPinned: false,
    tags: [],
  }
  return c.json(attachment, 201)
})

interface AttachmentFolderRow {
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

interface AttachmentTagRow {
  id: string
  user_id: string
  name: string
  color: string | null
  is_pinned: number
  created_at: number
}

filesRoutes.get('/folders', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `SELECT id, user_id, parent_id, name, icon, color, position, created_at, updated_at
       FROM attachment_folders WHERE user_id = ?1 ORDER BY position ASC, created_at ASC`
  ).bind(userId).all<AttachmentFolderRow>()
  return c.json(results.map(r => ({
    id: r.id,
    userId: r.user_id,
    parentId: r.parent_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
})

filesRoutes.post('/folders', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    id?: string
    name?: string
    parentId?: string | null
    color?: string | null
    icon?: string | null
    position?: number
  }>()
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : 'New Folder'
  const parentId = body.parentId && isValidId(body.parentId) ? body.parentId : null
  const now = Date.now()
  const position = typeof body.position === 'number' ? body.position : now

  await c.env.DB.prepare(
    `INSERT INTO attachment_folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(id, userId, parentId, name, body.icon ?? null, body.color ?? null, position, now, now).run()

  return c.json({
    id,
    userId,
    parentId,
    name,
    icon: body.icon ?? null,
    color: body.color ?? null,
    position,
    createdAt: now,
    updatedAt: now,
  }, 201)
})

filesRoutes.patch('/folders/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Folder not found')
  const body = await c.req.json<{
    name?: string
    parentId?: string | null
    color?: string | null
    icon?: string | null
    position?: number
  }>()

  const existing = await c.env.DB.prepare(
    `SELECT id, name, parent_id, icon, color, position, created_at, updated_at FROM attachment_folders WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentFolderRow>()
  if (!existing) throw ApiError.notFound('Folder not found')

  const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : existing.name
  const nextParent = body.parentId !== undefined ? (body.parentId && isValidId(body.parentId) ? body.parentId : null) : existing.parent_id
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextIcon = body.icon !== undefined ? body.icon : existing.icon
  const nextPosition = typeof body.position === 'number' ? body.position : existing.position
  const now = Date.now()

  await c.env.DB.prepare(
    `UPDATE attachment_folders SET name = ?1, parent_id = ?2, color = ?3, icon = ?4, position = ?5, updated_at = ?6
     WHERE id = ?7 AND user_id = ?8`
  ).bind(nextName, nextParent, nextColor, nextIcon, nextPosition, now, id, userId).run()

  return c.json({
    id,
    userId,
    parentId: nextParent,
    name: nextName,
    icon: nextIcon,
    color: nextColor,
    position: nextPosition,
    createdAt: existing.created_at,
    updatedAt: now,
  })
})

filesRoutes.delete('/folders/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Folder not found')

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE attachments SET folder_id = NULL WHERE folder_id = ?1 AND user_id = ?2`).bind(id, userId),
    c.env.DB.prepare(`UPDATE attachment_folders SET parent_id = NULL WHERE parent_id = ?1 AND user_id = ?2`).bind(id, userId),
    c.env.DB.prepare(`DELETE FROM attachment_folders WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
  ])
  return c.json({ ok: true })
})

filesRoutes.get('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at
       FROM attachment_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, name ASC`
  ).bind(userId).all<AttachmentTagRow>()
  return c.json(results.map(r => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    isPinned: Boolean(r.is_pinned),
    createdAt: r.created_at,
  })))
})

filesRoutes.post('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    id?: string
    name: string
    color?: string | null
  }>()
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  if (!name) throw ApiError.badRequest('Tag name is required')
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const now = Date.now()

  await c.env.DB.prepare(
    `INSERT INTO attachment_tags (id, user_id, name, color, is_pinned, created_at)
     VALUES (?1, ?2, ?3, ?4, 0, ?5)
     ON CONFLICT(user_id, name) DO UPDATE SET color = COALESCE(?4, color)`
  ).bind(id, userId, name, body.color ?? null, now).run()

  const tag = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at FROM attachment_tags WHERE user_id = ?1 AND name = ?2`
  ).bind(userId, name).first<AttachmentTagRow>()

  return c.json({
    id: tag?.id ?? id,
    userId,
    name,
    color: tag?.color ?? body.color ?? null,
    isPinned: Boolean(tag?.is_pinned),
    createdAt: tag?.created_at ?? now,
  }, 201)
})

filesRoutes.patch('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Tag not found')
  const body = await c.req.json<{
    name?: string
    color?: string | null
    isPinned?: boolean
  }>()

  const existing = await c.env.DB.prepare(
    `SELECT id, name, color, is_pinned, created_at FROM attachment_tags WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentTagRow>()
  if (!existing) throw ApiError.notFound('Tag not found')

  const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 50) : existing.name
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned

  await c.env.DB.prepare(
    `UPDATE attachment_tags SET name = ?1, color = ?2, is_pinned = ?3 WHERE id = ?4 AND user_id = ?5`
  ).bind(nextName, nextColor, nextPinned, id, userId).run()

  if (nextName !== existing.name) {
    const { results } = await c.env.DB.prepare(
      `SELECT id, tags FROM attachments WHERE user_id = ?1 AND tags LIKE ?2`
    ).bind(userId, `%"${existing.name}"%`).all<{ id: string; tags: string }>()
    const stmts: D1PreparedStatement[] = []
    for (const row of results) {
      const parsed = parseTags(row.tags)
      const updated = parsed.map(t => t === existing.name ? nextName : t)
      stmts.push(
        c.env.DB.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`).bind(JSON.stringify(updated), row.id, userId)
      )
    }
    if (stmts.length) await c.env.DB.batch(stmts)
  }

  return c.json({
    id,
    userId,
    name: nextName,
    color: nextColor,
    isPinned: Boolean(nextPinned),
    createdAt: existing.created_at,
  })
})

filesRoutes.delete('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Tag not found')

  const existing = await c.env.DB.prepare(
    `SELECT name FROM attachment_tags WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<{ name: string }>()

  if (existing) {
    const { results } = await c.env.DB.prepare(
      `SELECT id, tags FROM attachments WHERE user_id = ?1 AND tags LIKE ?2`
    ).bind(userId, `%"${existing.name}"%`).all<{ id: string; tags: string }>()
    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(`DELETE FROM attachment_tags WHERE id = ?1 AND user_id = ?2`).bind(id, userId)
    ]
    for (const row of results) {
      const parsed = parseTags(row.tags)
      const updated = parsed.filter(t => t !== existing.name)
      stmts.push(
        c.env.DB.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`).bind(JSON.stringify(updated), row.id, userId)
      )
    }
    await c.env.DB.batch(stmts)
  }

  return c.json({ ok: true })
})

filesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Attachment not found')
  const shareSlug = c.req.query('share')

  const row = await c.env.DB.prepare(
    `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, created_at
       FROM attachments WHERE id = ?1`,
  )
    .bind(id)
    .first<AttachmentRow>()
  if (!row) throw ApiError.notFound('Attachment not found')

  const userId = c.get('userId')
  let allowed = Boolean(userId && userId === row.user_id)
  if (!allowed && isValidSlug(shareSlug)) {
    const share = await c.env.DB.prepare(
      `SELECT s.slug, s.password_hash, n.content
         FROM shares s
         JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
        WHERE s.slug = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL
          AND (s.expires_at IS NULL OR s.expires_at > ?3)`,
    )
      .bind(shareSlug, row.user_id, Date.now())
      .first<{ slug: string; password_hash: string | null; content: string }>()
    allowed = Boolean(
      share &&
        extractAttachmentIds(share.content).includes(row.id) &&
        (!share.password_hash ||
          (await verifyShareAssetSession(
            c.env.DB,
            getCookie(c, shareAssetCookieName(shareSlug)),
            share.slug,
            share.password_hash,
          ))),
    )
  }
  if (!allowed) throw ApiError.unauthenticated('You do not have access to this attachment')

  const isPreview = c.req.query('preview') === '1' || c.req.query('inline') === '1'
  const isPreviewable =
    isInlineSafe(row.mime) ||
    (isPreview && (row.mime === 'application/pdf' || row.mime.startsWith('text/') || row.mime === 'application/json'))

  const headers = new Headers({
    'Content-Type': row.mime,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${isPreviewable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeContentDispositionFilename(row.filename)}`,
    'X-Content-Type-Options': 'nosniff',
  })
  if (isPreview && !isInlineSafe(row.mime)) {
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  }

  if (!hasAttachmentStorage(c.env, row.storage)) {
    throw new ApiError(
      503,
      'storage_unavailable',
      `${row.storage === 'r2' ? 'R2' : 'Workers KV'} attachment storage is not bound, so the attachment cannot be read`,
    )
  }
  let object = await readAttachmentObjectStream(c.env, row.storage, attachmentObjectKey(row))
  if (!object) {
    object = await readAttachmentObjectStream(c.env, row.storage, legacyAttachmentObjectKey(row))
  }
  if (!object) throw ApiError.notFound('Attachment data is missing')
  return new Response(object.body as BodyInit, { headers })
})


filesRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.query('folderId')
  const type = c.req.query('type')
  const sizeRange = c.req.query('sizeRange')
  const minBytes = Number(c.req.query('minBytes'))
  const maxBytes = Number(c.req.query('maxBytes'))
  const tag = c.req.query('tag')
  const starred = c.req.query('starred')
  const pinned = c.req.query('pinned')
  const noteId = c.req.query('noteId')
  const extension = c.req.query('extension')?.trim().toLowerCase()
  const search = c.req.query('search')?.trim()
  const sort = c.req.query('sort') || 'date_desc'
  const limitParam = Number(c.req.query('limit'))
  const pageSize = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : ATTACHMENT_LIST_PAGE_SIZE
  const cursor = parseAttachmentListCursor(c.req.query('cursor'))

  const whereClauses: string[] = ['user_id = ?']
  const bindings: unknown[] = [userId]

  if (folderId === 'unfiled') {
    whereClauses.push('folder_id IS NULL')
  } else if (folderId) {
    whereClauses.push('folder_id = ?')
    bindings.push(folderId)
  }

  if (extension && extension !== 'all') {
    const exts = extension
      .split(',')
      .map((e) => e.trim().replace(/^\./, ''))
      .filter(Boolean)
    if (exts.length) {
      const orClauses = exts.map(() => 'LOWER(filename) LIKE ?')
      whereClauses.push(`(${orClauses.join(' OR ')})`)
      for (const e of exts) {
        bindings.push(`%.${e}`)
      }
    }
  }

  if (type === 'image') {
    whereClauses.push("mime LIKE 'image/%'")
  } else if (type === 'pdf') {
    whereClauses.push("mime = 'application/pdf'")
  } else if (type === 'document') {
    whereClauses.push("(mime = 'application/pdf' OR mime LIKE 'text/%' OR mime LIKE '%document%' OR mime LIKE '%sheet%' OR mime LIKE '%presentation%' OR mime LIKE 'application/vnd.%' OR mime LIKE 'application/msword')")
  } else if (type === 'media') {
    whereClauses.push("(mime LIKE 'audio/%' OR mime LIKE 'video/%')")
  } else if (type === 'archive') {
    whereClauses.push("(mime LIKE '%zip%' OR mime LIKE '%tar%' OR mime LIKE '%rar%' OR mime LIKE '%7z%' OR mime LIKE '%gzip%')")
  } else if (type === 'code') {
    whereClauses.push("(mime LIKE '%javascript%' OR mime LIKE '%json%' OR mime LIKE '%typescript%' OR mime LIKE '%xml%' OR mime LIKE '%yaml%' OR filename LIKE '%.py' OR filename LIKE '%.rs' OR filename LIKE '%.go' OR filename LIKE '%.ts' OR filename LIKE '%.js' OR filename LIKE '%.html' OR filename LIKE '%.css' OR filename LIKE '%.sh')")
  }

  if (sizeRange === 'small') {
    whereClauses.push('size < 1048576')
  } else if (sizeRange === 'medium') {
    whereClauses.push('size >= 1048576 AND size <= 10485760')
  } else if (sizeRange === 'large') {
    whereClauses.push('size > 10485760')
  }

  if (Number.isFinite(minBytes) && minBytes >= 0) {
    whereClauses.push('size >= ?')
    bindings.push(minBytes)
  }
  if (Number.isFinite(maxBytes) && maxBytes >= 0) {
    whereClauses.push('size <= ?')
    bindings.push(maxBytes)
  }

  if (tag) {
    whereClauses.push('tags LIKE ?')
    bindings.push(`%"${tag}"%`)
  }

  if (starred === '1') {
    whereClauses.push('is_starred = 1')
  }
  if (pinned === '1') {
    whereClauses.push('is_pinned = 1')
  }
  if (noteId) {
    whereClauses.push('note_id = ?')
    bindings.push(noteId)
  }

  if (search) {
    whereClauses.push('(filename LIKE ? OR tags LIKE ?)')
    bindings.push(`%${search}%`, `%"${search}"%`)
  }

  let orderBy = 'is_pinned DESC, created_at DESC, id DESC'
  if (sort === 'date_asc') orderBy = 'is_pinned DESC, created_at ASC, id ASC'
  else if (sort === 'name_asc') orderBy = 'is_pinned DESC, filename ASC, id ASC'
  else if (sort === 'name_desc') orderBy = 'is_pinned DESC, filename DESC, id DESC'
  else if (sort === 'size_desc') orderBy = 'is_pinned DESC, size DESC, id DESC'
  else if (sort === 'size_asc') orderBy = 'is_pinned DESC, size ASC, id ASC'

  if (cursor) {
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))')
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id)
  }

  const querySql = `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
     FROM attachments WHERE ${whereClauses.join(' AND ')}
     ORDER BY ${orderBy} LIMIT ?`
  bindings.push(pageSize + 1)

  const TOTAL_QUOTA_BYTES = 10 * 1024 * 1024 * 1024

  const [itemsResult, statsRow, references, folderCountRow, tagCountRow, largestRows, allFilesForExt] = await Promise.all([
    c.env.DB.prepare(querySql).bind(...bindings).all<AttachmentRow>(),
    c.env.DB.prepare(
      `SELECT
         COUNT(*) as total_count,
         COALESCE(SUM(size), 0) as total_bytes,
         COALESCE(SUM(CASE WHEN mime LIKE 'image/%' THEN size ELSE 0 END), 0) as image_bytes,
         COALESCE(SUM(CASE WHEN mime = 'application/pdf' OR mime LIKE 'text/%' OR mime LIKE '%document%' OR mime LIKE '%sheet%' OR mime LIKE '%presentation%' OR mime LIKE 'application/vnd.%' OR mime LIKE 'application/msword' THEN size ELSE 0 END), 0) as document_bytes,
         COALESCE(SUM(CASE WHEN mime LIKE 'audio/%' OR mime LIKE 'video/%' THEN size ELSE 0 END), 0) as media_bytes,
         COALESCE(SUM(CASE WHEN mime LIKE '%zip%' OR mime LIKE '%tar%' OR mime LIKE '%rar%' OR mime LIKE '%7z%' OR mime LIKE '%gzip%' THEN size ELSE 0 END), 0) as archive_bytes,
         COALESCE(SUM(CASE WHEN mime LIKE '%javascript%' OR mime LIKE '%json%' OR filename LIKE '%.py' OR filename LIKE '%.rs' OR filename LIKE '%.go' OR filename LIKE '%.ts' OR filename LIKE '%.js' THEN size ELSE 0 END), 0) as code_bytes
       FROM attachments WHERE user_id = ?1`
    ).bind(userId).first<{
      total_count: number
      total_bytes: number
      image_bytes: number
      document_bytes: number
      media_bytes: number
      archive_bytes: number
      code_bytes: number
    }>(),
    readAttachmentReferenceCounts(c.env.DB, userId),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM attachment_folders WHERE user_id = ?1`).bind(userId).first<{ count: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as count FROM attachment_tags WHERE user_id = ?1`).bind(userId).first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
         FROM attachments WHERE user_id = ?1 ORDER BY size DESC LIMIT 5`
    ).bind(userId).all<AttachmentRow>(),
    c.env.DB.prepare(`SELECT filename, size FROM attachments WHERE user_id = ?1`).bind(userId).all<{ filename: string; size: number }>(),
  ])

  const results = itemsResult.results
  const page = results.slice(0, pageSize)
  const hasMore = results.length > pageSize

  const totalBytes = statsRow?.total_bytes ?? 0
  const imageBytes = statsRow?.image_bytes ?? 0
  const documentBytes = statsRow?.document_bytes ?? 0
  const mediaBytes = statsRow?.media_bytes ?? 0
  const archiveBytes = statsRow?.archive_bytes ?? 0
  const codeBytes = statsRow?.code_bytes ?? 0
  const otherBytes = Math.max(0, totalBytes - (imageBytes + documentBytes + mediaBytes + archiveBytes + codeBytes))

  const extensionBreakdown: Record<string, { count: number; bytes: number }> = {}
  for (const row of allFilesForExt.results) {
    const ext = row.filename.split('.').pop()?.toLowerCase() || 'other'
    const curr = extensionBreakdown[ext] ?? { count: 0, bytes: 0 }
    curr.count += 1
    curr.bytes += row.size
    extensionBreakdown[ext] = curr
  }

  return c.json({
    files: page.map((row) => ({
      ...toAttachment(row),
      references: references.get(row.id) ?? 0,
    })),
    nextCursor: hasMore && page.length
      ? `${page[page.length - 1]!.created_at}.${page[page.length - 1]!.id}`
      : null,
    stats: {
      totalCount: statsRow?.total_count ?? 0,
      totalBytes,
      totalQuotaBytes: TOTAL_QUOTA_BYTES,
      imageBytes,
      documentBytes,
      mediaBytes,
      archiveBytes,
      codeBytes,
      otherBytes,
      unreferencedCount: Math.max(0, (statsRow?.total_count ?? 0) - references.size),
      folderCount: folderCountRow?.count ?? 0,
      tagCount: tagCountRow?.count ?? 0,
      extensionBreakdown,
      largestFiles: largestRows.results.map((row) => ({
        ...toAttachment(row),
        references: references.get(row.id) ?? 0,
      })),
    },
  })
})

filesRoutes.patch('/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = await c.req.json<{
    filename?: string
    folderId?: string | null
    isStarred?: boolean
    isPinned?: boolean
    tags?: string[]
    updateNoteReferences?: boolean
  }>()

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id, filename, folder_id, is_starred, is_pinned, tags FROM attachments WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentRow>()
  if (!existing) throw ApiError.notFound('Attachment not found')

  const nextFilename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim() : existing.filename
  const nextFolderId = body.folderId !== undefined ? body.folderId : existing.folder_id
  const nextStarred = body.isStarred !== undefined ? (body.isStarred ? 1 : 0) : existing.is_starred
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned
  const nextTags = body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE attachments SET filename = ?1, folder_id = ?2, is_starred = ?3, is_pinned = ?4, tags = ?5 WHERE id = ?6 AND user_id = ?7`
    ).bind(nextFilename, nextFolderId, nextStarred, nextPinned, nextTags, id, userId)
  ]

  if (body.updateNoteReferences && nextFilename !== existing.filename) {
    const { results: referencingNotes } = await c.env.DB.prepare(
      `SELECT id, content FROM notes WHERE user_id = ?1 AND content LIKE ?2 AND deleted_at IS NULL`
    ).bind(userId, `%/api/files/${id}%`).all<{ id: string; content: string }>()

    for (const note of referencingNotes) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(!?\\[)[^\\]]*(\\]\\(<?/api/files/${escapedId}>?[^)]*\\))`, 'g')
      const nextContent = note.content.replace(regex, `$1${nextFilename}$2`)
      if (nextContent !== note.content) {
        statements.push(
          c.env.DB.prepare(`UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4`)
            .bind(nextContent, Date.now(), note.id, userId)
        )
      }
    }
  }

  await c.env.DB.batch(statements)

  const updated = await c.env.DB.prepare(
    `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
       FROM attachments WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentRow>()
  if (!updated) throw ApiError.notFound('Attachment not found')

  return c.json(toAttachment(updated))
})

filesRoutes.post('/batch', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    action: 'move' | 'star' | 'pin' | 'tag' | 'delete'
    ids: string[]
    folderId?: string | null
    isStarred?: boolean
    isPinned?: boolean
    addTags?: string[]
    removeTags?: string[]
  }>()

  if (!Array.isArray(body.ids) || !body.ids.length) {
    return c.json({ ok: true, count: 0 })
  }

  const ids = body.ids.filter(isValidId)
  if (!ids.length) return c.json({ ok: true, count: 0 })

  if (body.action === 'move') {
    const targetFolderId = body.folderId ?? null
    const statements = ids.map((id) =>
      c.env.DB.prepare(`UPDATE attachments SET folder_id = ?1 WHERE id = ?2 AND user_id = ?3`).bind(targetFolderId, id, userId)
    )
    await c.env.DB.batch(statements)
    return c.json({ ok: true, count: ids.length })
  }

  if (body.action === 'star') {
    const val = body.isStarred ? 1 : 0
    const statements = ids.map((id) =>
      c.env.DB.prepare(`UPDATE attachments SET is_starred = ?1 WHERE id = ?2 AND user_id = ?3`).bind(val, id, userId)
    )
    await c.env.DB.batch(statements)
    return c.json({ ok: true, count: ids.length })
  }

  if (body.action === 'pin') {
    const val = body.isPinned ? 1 : 0
    const statements = ids.map((id) =>
      c.env.DB.prepare(`UPDATE attachments SET is_pinned = ?1 WHERE id = ?2 AND user_id = ?3`).bind(val, id, userId)
    )
    await c.env.DB.batch(statements)
    return c.json({ ok: true, count: ids.length })
  }

  if (body.action === 'tag') {
    const add = new Set(body.addTags ?? [])
    const remove = new Set(body.removeTags ?? [])
    for (const id of ids) {
      const row = await c.env.DB.prepare(`SELECT tags FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(id, userId).first<{ tags: string }>()
      if (row) {
        let current = parseTags(row.tags)
        current = current.filter((t) => !remove.has(t))
        for (const a of add) {
          if (!current.includes(a)) current.push(a)
        }
        await c.env.DB.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`).bind(JSON.stringify(current), id, userId).run()
      }
    }
    return c.json({ ok: true, count: ids.length })
  }

  if (body.action === 'delete') {
    let deletedCount = 0
    for (const id of ids) {
      const row = await c.env.DB.prepare(
        `SELECT id, user_id, filename, mime, storage FROM attachments WHERE id = ?1 AND user_id = ?2`,
      ).bind(id, userId).first<AttachmentRow>()
      if (!row) continue

      const statements: D1PreparedStatement[] = [
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
           SELECT ?1, user_id, ?2 FROM attachments WHERE id = ?3 AND user_id = ?4`,
        ).bind(
          attachmentCleanupTarget(row.storage, attachmentObjectKey(row)),
          Date.now(),
          id,
          userId,
        ),
        c.env.DB.prepare(
          `DELETE FROM import_mappings WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2`,
        ).bind(userId, id),
        c.env.DB.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
      ]
      await c.env.DB.batch(statements)
      deletedCount++
    }
    void drainAttachmentCleanup(c.env, userId).catch(() => {})
    return c.json({ ok: true, count: deletedCount })
  }

  return c.json({ ok: true, count: 0 })
})

filesRoutes.get('/:id/notes', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Attachment not found')

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, folder_id FROM notes
      WHERE user_id = ?1 AND content LIKE ?2 AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 20`
  ).bind(userId, `%/api/files/${id}%`).all<{ id: string; title: string; folder_id: string | null }>()

  return c.json({
    notes: results.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      folderId: n.folder_id,
    })),
  })
})

filesRoutes.delete('/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, filename, mime, storage FROM attachments WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(id, userId)
    .first<AttachmentRow>()
  if (!row) throw ApiError.notFound('Attachment not found')

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
       SELECT ?1, user_id, ?2 FROM attachments WHERE id = ?3 AND user_id = ?4`,
    ).bind(
      attachmentCleanupTarget(row.storage, attachmentObjectKey(row)),
      Date.now(),
      id,
      userId,
    ),
  ]
  statements.push(
    c.env.DB.prepare(
      `DELETE FROM import_mappings
        WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2`,
    ).bind(userId, id),
  )
  statements.push(
    c.env.DB.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
  )
  const results = await c.env.DB.batch(statements)
  if (!results.at(-1)?.meta.changes) throw ApiError.notFound('Attachment not found')

  const cleanup = await drainAttachmentCleanup(c.env, userId).catch((error) => {
    console.warn('[inkstone] Attachment deletion will retry later:', error)
    return { processed: 0, pending: true }
  })
  return c.json({ ok: true, cleanupPending: cleanup.pending })
})

filesRoutes.post('/prune', requireAuth, async (c) => {
  const userId = c.get('userId')

  const [boundaryResult, cursorResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT created_at, id FROM attachments
        WHERE user_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).bind(userId),
    c.env.DB.prepare(
      `SELECT seq FROM changes WHERE user_id = ?1 AND entity = 'note'
        ORDER BY seq DESC LIMIT 1`,
    ).bind(userId),
  ])
  const boundary = (boundaryResult as D1Result<{ created_at: number; id: string }>).results[0]
  if (!boundary) return c.json({ removed: 0, freedBytes: 0 })
  const scanCursor = (cursorResult as D1Result<{ seq: number }>).results[0]?.seq ?? 0
  const attachmentIds = await collectAttachmentIdsThroughBoundary(c.env.DB, userId, boundary)
  const referenced = await collectAttachmentReferences(c.env.DB, userId, attachmentIds, { earlyExit: true })

  let removed = 0
  let freedBytes = 0
  let statements: D1PreparedStatement[] = []
  const operations: Array<
    { kind: 'queue' | 'mapping' } | { kind: 'delete'; file: AttachmentRow }
  > = []

  const flush = async () => {
    if (!statements.length) return
    const results = await c.env.DB.batch(statements)
    results.forEach((result, index) => {
      const operation = operations[index]
      if (operation?.kind === 'delete' && result.meta.changes) {
        removed += 1
        freedBytes += operation.file.size
      }
    })
    statements = []
    operations.length = 0
  }

  let pageCursor: { createdAt: number; id: string } | null = null
  while (true) {
    const query: D1PreparedStatement = pageCursor
      ? c.env.DB.prepare(
          `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, created_at
             FROM attachments WHERE user_id = ?1
              AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
              AND (created_at > ?4 OR (created_at = ?4 AND id > ?5))
            ORDER BY created_at ASC, id ASC LIMIT ?6`,
        ).bind(
          userId,
          boundary.created_at,
          boundary.id,
          pageCursor.createdAt,
          pageCursor.id,
          ATTACHMENT_SCAN_PAGE_SIZE,
        )
      : c.env.DB.prepare(
          `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, created_at
             FROM attachments WHERE user_id = ?1
              AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
            ORDER BY created_at ASC, id ASC LIMIT ?4`,
        ).bind(userId, boundary.created_at, boundary.id, ATTACHMENT_SCAN_PAGE_SIZE)
    const files: AttachmentRow[] = (await query.all<AttachmentRow>()).results
    if (!files.length) break

    for (const file of files) {
      if (referenced.has(file.id)) continue
      const guard = `id = ?1 AND user_id = ?2 AND NOT EXISTS (
        SELECT 1 FROM changes c
         WHERE c.user_id = ?2 AND c.entity = 'note' AND c.seq > ?3
      )`
      const needed = 3
      if (statements.length + needed > 100) await flush()
      statements.push(
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
           SELECT ?4, user_id, ?5 FROM attachments WHERE ${guard}`,
        ).bind(
          file.id,
          userId,
          scanCursor,
          attachmentCleanupTarget(file.storage, attachmentObjectKey(file)),
          Date.now(),
        ),
      )
      operations.push({ kind: 'queue' })
      statements.push(
        c.env.DB.prepare(
          `DELETE FROM import_mappings
            WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2
              AND EXISTS (
                SELECT 1 FROM attachments a
                 WHERE a.id = ?2 AND a.user_id = ?1 AND NOT EXISTS (
                   SELECT 1 FROM changes c
                    WHERE c.user_id = ?1 AND c.entity = 'note' AND c.seq > ?3
                 )
              )`,
        ).bind(userId, file.id, scanCursor),
      )
      operations.push({ kind: 'mapping' })
      statements.push(
        c.env.DB.prepare(`DELETE FROM attachments WHERE ${guard}`).bind(file.id, userId, scanCursor),
      )
      operations.push({ kind: 'delete', file })
    }
    const last: AttachmentRow = files[files.length - 1]!
    pageCursor = { createdAt: last.created_at, id: last.id }
    if (files.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  await flush()

  const cleanup = await drainAttachmentCleanup(c.env, userId).catch((error) => {
    console.warn('[inkstone] Attachment cleanup will retry later:', error)
    return { processed: 0, pending: true }
  })
  return c.json({ removed, freedBytes, cleanupPending: cleanup.pending })
})
