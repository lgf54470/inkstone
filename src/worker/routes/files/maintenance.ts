import { Hono } from "hono";

import { drainAttachmentCleanup } from "../../attachments/cleanup";
import { attachmentCleanupTarget, attachmentObjectKey } from "../../attachments/keys";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { isValidId } from "../../lib/id";
import { requireAuth } from "../../middleware/auth";
import { AttachmentRow } from './helpers';
import { ATTACHMENT_SCAN_PAGE_SIZE } from './helpers';
import { parseTags } from './helpers';
import { collectAttachmentReferences } from './helpers';
import { collectAttachmentIdsThroughBoundary } from './helpers';

export function registerFilesMaintenanceRoutes(filesRoutes: Hono<AppBindings>): void {
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
}

