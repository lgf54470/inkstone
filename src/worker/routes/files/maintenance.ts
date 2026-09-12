import { Hono } from 'hono'

import { drainAttachmentCleanup } from '../../attachments/cleanup'
import { attachmentCleanupTarget, attachmentObjectKeyCandidates } from '../../attachments/keys'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidId } from '../../lib/id'
import { requireAuth } from '../../middleware/auth'
import { AttachmentRow } from './helpers'
import { ATTACHMENT_SCAN_PAGE_SIZE } from './helpers'
import { parseTags } from './helpers'
import { collectAttachmentReferences } from './helpers'
import { collectAttachmentIdsThroughBoundary } from './helpers'

interface AttachmentBatchBody {
  action: 'move' | 'star' | 'pin' | 'tag' | 'delete'
  ids: string[]
  folderId?: string | null
  isStarred?: boolean
  isPinned?: boolean
  addTags?: string[]
  removeTags?: string[]
}

interface BatchContext {
  env: AppBindings['Bindings']
  db: D1Database
}

type BatchAction = (
  ctx: BatchContext,
  ids: string[],
  userId: string,
  body: AttachmentBatchBody,
) => Promise<number>

const ATTACHMENT_BATCH_ACTIONS: Record<string, BatchAction> = {
  move: async ({ db }, ids, userId, body) => {
    const targetFolderId = body.folderId ?? null
    const statements = ids.map((id) =>
      db.prepare(`UPDATE attachments SET folder_id = ?1 WHERE id = ?2 AND user_id = ?3`).bind(targetFolderId, id, userId)
    )
    await db.batch(statements)
    return ids.length
  },
  star: async ({ db }, ids, userId, body) => {
    const val = body.isStarred ? 1 : 0
    const statements = ids.map((id) =>
      db.prepare(`UPDATE attachments SET is_starred = ?1 WHERE id = ?2 AND user_id = ?3`).bind(val, id, userId)
    )
    await db.batch(statements)
    return ids.length
  },
  pin: async ({ db }, ids, userId, body) => {
    const val = body.isPinned ? 1 : 0
    const statements = ids.map((id) =>
      db.prepare(`UPDATE attachments SET is_pinned = ?1 WHERE id = ?2 AND user_id = ?3`).bind(val, id, userId)
    )
    await db.batch(statements)
    return ids.length
  },
  tag: ({ db }, ids, userId, body) => applyAttachmentTagChanges(db, ids, userId, body),
  delete: ({ env, db }, ids, userId) => deleteAttachmentsBatch(env, db, ids, userId),
}

export function registerFilesMaintenanceRoutes(filesRoutes: Hono<AppBindings>): void {
  registerFilesBatchRoute(filesRoutes)
  registerFilesNotesRoute(filesRoutes)
  registerFilesDeleteRoute(filesRoutes)
  registerFilesPruneRoute(filesRoutes)
}

function registerFilesBatchRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.post('/batch', requireAuth, async (c) => {
    const userId = c.get('userId')
    const body = await c.req.json<AttachmentBatchBody>()

    if (!Array.isArray(body.ids) || !body.ids.length) {
      return c.json({ ok: true, count: 0 })
    }
    const ids = body.ids.filter(isValidId)
    if (!ids.length) return c.json({ ok: true, count: 0 })

    const action = ATTACHMENT_BATCH_ACTIONS[body.action]
    if (!action) return c.json({ ok: true, count: 0 })
    const count = await action({ env: c.env, db: c.env.DB }, ids, userId, body)
    return c.json({ ok: true, count })
  })
}

async function applyAttachmentTagChanges(
  db: D1Database,
  ids: string[],
  userId: string,
  body: AttachmentBatchBody,
): Promise<number> {
  const add = new Set(body.addTags ?? [])
  const remove = new Set(body.removeTags ?? [])
  for (const id of ids) {
    const row = await db.prepare(`SELECT tags FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(id, userId).first<{ tags: string }>()
    if (!row) continue
    const merged = mergeAttachmentTags(row.tags, add, remove)
    await db.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`).bind(JSON.stringify(merged), id, userId).run()
  }
  return ids.length
}

function mergeAttachmentTags(raw: string, add: Set<string>, remove: Set<string>): string[] {
  let current = parseTags(raw)
  current = current.filter((t) => !remove.has(t))
  for (const a of add) {
    if (!current.includes(a)) current.push(a)
  }
  return current
}

async function deleteAttachmentsBatch(
  env: AppBindings['Bindings'],
  db: D1Database,
  ids: string[],
  userId: string,
): Promise<number> {
  let deletedCount = 0
  for (const id of ids) {
    const row = await db.prepare(
      `SELECT id, user_id, filename, mime, storage, object_key, created_at FROM attachments WHERE id = ?1 AND user_id = ?2`,
    ).bind(id, userId).first<AttachmentRow>()
    if (!row) continue
    await db.batch(attachmentDeleteStatements(db, userId, row))
    deletedCount++
  }
  // A failed drain is safe: cleanup rows stay queued and the next scheduled run retries them.
  void drainAttachmentCleanup(env, userId).catch(() => {})
  return deletedCount
}

function attachmentDeleteStatements(db: D1Database, userId: string, row: AttachmentRow): D1PreparedStatement[] {
  return [
    ...attachmentObjectKeyCandidates(row).map((key) =>
      db.prepare(
        `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
         SELECT ?1, user_id, ?2 FROM attachments WHERE id = ?3 AND user_id = ?4`,
      ).bind(attachmentCleanupTarget(row.storage, key), Date.now(), row.id, userId),
    ),
    db.prepare(
      `DELETE FROM import_mappings WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2`,
    ).bind(userId, row.id),
    db.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(row.id, userId),
  ]
}

function registerFilesNotesRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.get('/:id/notes', requireAuth, async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!isValidId(id)) throw ApiError.notFound('Attachment not found')

    const { results } = await c.env.DB.prepare(
      `SELECT id, title, folder_id FROM notes
        WHERE user_id = ?1 AND content LIKE ?2 AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 20`,
    ).bind(userId, `%/api/files/${id}%`).all<{ id: string; title: string; folder_id: string | null }>()

    return c.json({
      notes: results.map((n) => ({
        id: n.id,
        title: n.title || 'Untitled',
        folderId: n.folder_id,
      })),
    })
  })
}

function registerFilesDeleteRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.delete('/:id', requireAuth, async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const row = await loadOwnedAttachment(c.env.DB, userId, id)
    if (!row) throw ApiError.notFound('Attachment not found')

    const results = await c.env.DB.batch(attachmentDeleteStatements(c.env.DB, userId, row))
    if (!results.at(-1)?.meta.changes) throw ApiError.notFound('Attachment not found')

    const cleanup = await drainCleanupSafely(c.env, userId, '[inkstone] Attachment deletion will retry later:')
    return c.json({ ok: true, cleanupPending: cleanup.pending })
  })
}

async function loadOwnedAttachment(db: D1Database, userId: string, id: string): Promise<AttachmentRow | null> {
  return db.prepare(
    `SELECT id, user_id, filename, mime, storage, object_key, created_at FROM attachments WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<AttachmentRow>()
}

function registerFilesPruneRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.post('/prune', requireAuth, async (c) => {
    const userId = c.get('userId')
    return c.json(await pruneUnreferencedAttachments(c.env, c.env.DB, userId))
  })
}

async function pruneUnreferencedAttachments(
  env: AppBindings['Bindings'],
  db: D1Database,
  userId: string,
): Promise<{ removed: number; freedBytes: number; cleanupPending: boolean }> {
  const { boundary, scanCursor } = await loadPruneBoundary(db, userId)
  if (!boundary) return { removed: 0, freedBytes: 0, cleanupPending: false }

  const attachmentIds = await collectAttachmentIdsThroughBoundary(db, userId, boundary)
  const referenced = await collectAttachmentReferences(db, userId, attachmentIds, { earlyExit: true })

  const collector = new AttachmentPruneCollector(db, userId, scanCursor)
  let pageCursor: { createdAt: number; id: string } | null = null
  while (true) {
    const files = await loadPrunePage(db, userId, boundary, pageCursor)
    if (!files.length) break
    for (const file of files) {
      if (!referenced.has(file.id)) await collector.add(file)
    }
    const last: AttachmentRow = files[files.length - 1]!
    pageCursor = { createdAt: last.created_at, id: last.id }
    if (files.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  await collector.flush()

  const cleanup = await drainCleanupSafely(env, userId, '[inkstone] Attachment cleanup will retry later:')
  return { ...collector.summary(), cleanupPending: cleanup.pending }
}

async function loadPruneBoundary(
  db: D1Database,
  userId: string,
): Promise<{ boundary: { created_at: number; id: string } | null; scanCursor: number }> {
  const [boundaryResult, cursorResult] = await db.batch([
    db.prepare(
      `SELECT created_at, id FROM attachments
        WHERE user_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).bind(userId),
    db.prepare(
      `SELECT seq FROM changes WHERE user_id = ?1 AND entity = 'note'
        ORDER BY seq DESC LIMIT 1`,
    ).bind(userId),
  ])
  const boundary = (boundaryResult as D1Result<{ created_at: number; id: string }>).results[0] ?? null
  const scanCursor = (cursorResult as D1Result<{ seq: number }>).results[0]?.seq ?? 0
  return { boundary, scanCursor }
}

async function loadPrunePage(
  db: D1Database,
  userId: string,
  boundary: { created_at: number; id: string },
  pageCursor: { createdAt: number; id: string } | null,
): Promise<AttachmentRow[]> {
  const query: D1PreparedStatement = pageCursor
    ? db.prepare(
        `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, object_key, created_at
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
    : db.prepare(
        `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, object_key, created_at
           FROM attachments WHERE user_id = ?1
            AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
          ORDER BY created_at ASC, id ASC LIMIT ?4`,
      ).bind(userId, boundary.created_at, boundary.id, ATTACHMENT_SCAN_PAGE_SIZE)
  return (await query.all<AttachmentRow>()).results
}

class AttachmentPruneCollector {
  private statements: D1PreparedStatement[] = []
  private operations: Array<{ kind: 'queue' | 'mapping' | 'delete'; file?: AttachmentRow }> = []
  private removed = 0
  private freedBytes = 0

  constructor(
    private db: D1Database,
    private userId: string,
    private scanCursor: number,
  ) {}

  async add(file: AttachmentRow): Promise<void> {
    const guard = `id = ?1 AND user_id = ?2 AND NOT EXISTS (
      SELECT 1 FROM changes c
       WHERE c.user_id = ?2 AND c.entity = 'note' AND c.seq > ?3
    )`
    const needed = 2 + attachmentObjectKeyCandidates(file).length
    if (this.statements.length + needed > 100) await this.flush()
    for (const key of attachmentObjectKeyCandidates(file)) {
      this.statements.push(
        this.db.prepare(
          `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
           SELECT ?4, user_id, ?5 FROM attachments WHERE ${guard}`,
        ).bind(
          file.id,
          this.userId,
          this.scanCursor,
          attachmentCleanupTarget(file.storage, key),
          Date.now(),
        ),
      )
      this.operations.push({ kind: 'queue' })
    }
    this.statements.push(
      this.db.prepare(
        `DELETE FROM import_mappings
          WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2
            AND EXISTS (
              SELECT 1 FROM attachments a
               WHERE a.id = ?2 AND a.user_id = ?1 AND NOT EXISTS (
                 SELECT 1 FROM changes c
                  WHERE c.user_id = ?1 AND c.entity = 'note' AND c.seq > ?3
               )
            )`,
      ).bind(this.userId, file.id, this.scanCursor),
    )
    this.operations.push({ kind: 'mapping' })
    this.statements.push(
      this.db.prepare(`DELETE FROM attachments WHERE ${guard}`).bind(file.id, this.userId, this.scanCursor),
    )
    this.operations.push({ kind: 'delete', file })
  }

  async flush(): Promise<void> {
    if (!this.statements.length) return
    const results = await this.db.batch(this.statements)
    results.forEach((result, index) => {
      const operation = this.operations[index]
      if (operation?.kind === 'delete' && operation.file && result.meta.changes) {
        this.removed += 1
        this.freedBytes += operation.file.size
      }
    })
    this.statements = []
    this.operations.length = 0
  }

  summary(): { removed: number; freedBytes: number } {
    return { removed: this.removed, freedBytes: this.freedBytes }
  }
}

async function drainCleanupSafely(
  env: AppBindings['Bindings'],
  userId: string,
  warnMessage: string,
): Promise<{ processed: number; pending: boolean }> {
  return drainAttachmentCleanup(env, userId).catch((error) => {
    console.warn(warnMessage, error)
    return { processed: 0, pending: true }
  })
}