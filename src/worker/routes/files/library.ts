import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { extractAttachmentIds } from "@shared/markdown-utils";

import { hasAttachmentStorage, readAttachmentObjectStream } from "../../attachments/backend";
import { attachmentObjectKey, legacyAttachmentObjectKey } from "../../attachments/keys";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { isValidId, isValidSlug } from "../../lib/id";
import { isInlineSafe } from "../../lib/image";
import { shareAssetCookieName, verifyShareAssetSession } from "../../lib/share-asset-session";
import { requireAuth } from "../../middleware/auth";
import { AttachmentRow } from './helpers';
import { ATTACHMENT_LIST_PAGE_SIZE } from './helpers';
import { readAttachmentReferenceCounts } from './helpers';
import { encodeContentDispositionFilename } from './helpers';
import { parseAttachmentListCursor } from './helpers';
import { toAttachment } from './helpers';

export function registerFilesLibraryRoutes(filesRoutes: Hono<AppBindings>): void {
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
    (isPreview && (row.mime === 'application/pdf' || row.mime.startsWith('text/') || row.mime === 'application/json' || row.mime.startsWith('audio/') || row.mime.startsWith('video/')))

  const headers = new Headers({
    'Content-Type': row.mime,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${isPreviewable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeContentDispositionFilename(row.filename)}`,
    'X-Content-Type-Options': 'nosniff',
  })
  if (isPreview && !isInlineSafe(row.mime) && !row.mime.startsWith('audio/') && !row.mime.startsWith('video/')) {
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
}

