import { Hono } from "hono";
import type { Context } from 'hono';
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

const TOTAL_QUOTA_BYTES = 10 * 1024 * 1024 * 1024

const ATTACHMENT_TYPE_CONDITIONS: Record<string, string> = {
  image: "mime LIKE 'image/%'",
  pdf: "mime = 'application/pdf'",
  document:
    "(mime = 'application/pdf' OR mime LIKE 'text/%' OR mime LIKE '%document%' OR mime LIKE '%sheet%' OR mime LIKE '%presentation%' OR mime LIKE 'application/vnd.%' OR mime LIKE 'application/msword')",
  media: "(mime LIKE 'audio/%' OR mime LIKE 'video/%')",
  archive: "(mime LIKE '%zip%' OR mime LIKE '%tar%' OR mime LIKE '%rar%' OR mime LIKE '%7z%' OR mime LIKE '%gzip%')",
  code:
    "(mime LIKE '%javascript%' OR mime LIKE '%json%' OR mime LIKE '%typescript%' OR mime LIKE '%xml%' OR mime LIKE '%yaml%' OR filename LIKE '%.py' OR filename LIKE '%.rs' OR filename LIKE '%.go' OR filename LIKE '%.ts' OR filename LIKE '%.js' OR filename LIKE '%.html' OR filename LIKE '%.css' OR filename LIKE '%.sh')",
}

const SIZE_RANGE_CONDITIONS: Record<string, string> = {
  small: 'size < 1048576',
  medium: 'size >= 1048576 AND size <= 10485760',
  large: 'size > 10485760',
}

const ATTACHMENT_SORTS: Record<string, string> = {
  date_desc: 'is_pinned DESC, created_at DESC, id DESC',
  date_asc: 'is_pinned DESC, created_at ASC, id ASC',
  name_asc: 'is_pinned DESC, filename ASC, id ASC',
  name_desc: 'is_pinned DESC, filename DESC, id DESC',
  size_desc: 'is_pinned DESC, size DESC, id DESC',
  size_asc: 'is_pinned DESC, size ASC, id ASC',
}

interface AttachmentListParams {
  folderId?: string
  type?: string
  sizeRange?: string
  minBytes: number
  maxBytes: number
  tag?: string
  starred?: string
  pinned?: string
  noteId?: string
  extension?: string
  search?: string
  sort: string
  pageSize: number
  cursor: { createdAt: number; id: string } | null
}

export function registerFilesLibraryRoutes(filesRoutes: Hono<AppBindings>): void {
  registerFilesReadRoute(filesRoutes)
  registerFilesListRoute(filesRoutes)
}

function registerFilesReadRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!isValidId(id)) throw ApiError.notFound('Attachment not found')

    const row = await loadAttachmentRow(c.env.DB, id)
    if (!row) throw ApiError.notFound('Attachment not found')
    if (!(await canReadAttachment(c, row))) {
      throw ApiError.unauthenticated('You do not have access to this attachment')
    }

    const isPreview = c.req.query('preview') === '1' || c.req.query('inline') === '1'
    const object = await loadAttachmentObject(c.env, row)
    if (!object) throw ApiError.notFound('Attachment data is missing')
    return new Response(object.body as BodyInit, { headers: buildAttachmentHeaders(row, isPreview) })
  })
}

async function loadAttachmentRow(db: D1Database, id: string): Promise<AttachmentRow | null> {
  return db.prepare(
    `SELECT id, user_id, note_id, filename, mime, size, width, height, storage, created_at
       FROM attachments WHERE id = ?1`,
  ).bind(id).first<AttachmentRow>()
}

async function canReadAttachment(c: Context<AppBindings>, row: AttachmentRow): Promise<boolean> {
  const userId = c.get('userId')
  if (userId && userId === row.user_id) return true

  const shareSlug = c.req.query('share')
  if (!isValidSlug(shareSlug)) return false

  const share = await loadAttachmentShare(c.env.DB, shareSlug, row.user_id)
  if (!share || !extractAttachmentIds(share.content).includes(row.id)) return false
  if (!share.password_hash) return true

  return verifyShareAssetSession(
    c.env.DB,
    getCookie(c, shareAssetCookieName(shareSlug)),
    share.slug,
    share.password_hash,
  )
}

async function loadAttachmentShare(
  db: D1Database,
  shareSlug: string,
  ownerId: string,
): Promise<{ slug: string; password_hash: string | null; content: string } | null> {
  return db.prepare(
    `SELECT s.slug, s.password_hash, n.content
       FROM shares s
       JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.slug = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > ?3)`,
  ).bind(shareSlug, ownerId, Date.now()).first<{ slug: string; password_hash: string | null; content: string }>()
}

async function loadAttachmentObject(
  env: AppBindings['Bindings'],
  row: AttachmentRow,
): Promise<{ body: ReadableStream | null } | null> {
  if (!hasAttachmentStorage(env, row.storage)) {
    throw new ApiError(
      503,
      'storage_unavailable',
      `${row.storage === 'r2' ? 'R2' : 'Workers KV'} attachment storage is not bound, so the attachment cannot be read`,
    )
  }
  let object = await readAttachmentObjectStream(env, row.storage, attachmentObjectKey(row))
  if (!object) {
    object = await readAttachmentObjectStream(env, row.storage, legacyAttachmentObjectKey(row))
  }
  return object
}

function buildAttachmentHeaders(row: AttachmentRow, isPreview: boolean): Headers {
  const isPreviewable =
    isInlineSafe(row.mime) ||
    (isPreview &&
      (row.mime === 'application/pdf' ||
        row.mime.startsWith('text/') ||
        row.mime === 'application/json' ||
        row.mime.startsWith('audio/') ||
        row.mime.startsWith('video/')))

  const headers = new Headers({
    'Content-Type': row.mime,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${isPreviewable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeContentDispositionFilename(row.filename)}`,
    'X-Content-Type-Options': 'nosniff',
  })
  if (isPreview && !isInlineSafe(row.mime) && !row.mime.startsWith('audio/') && !row.mime.startsWith('video/')) {
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  }
  return headers
}

function registerFilesListRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.get('/', requireAuth, async (c) => {
    const userId = c.get('userId')
    const params = attachmentListParams(c)
    const { sql, bindings } = buildAttachmentListQuery(userId, params)
    const [itemsResult, statsRow, references, folderCountRow, tagCountRow, largestRows, allFilesForExt] =
      await Promise.all([
        c.env.DB.prepare(sql).bind(...bindings).all<AttachmentRow>(),
        loadAttachmentStorageStats(c.env.DB, userId),
        readAttachmentReferenceCounts(c.env.DB, userId),
        c.env.DB.prepare(`SELECT COUNT(*) as count FROM attachment_folders WHERE user_id = ?1`).bind(userId).first<{ count: number }>(),
        c.env.DB.prepare(`SELECT COUNT(*) as count FROM attachment_tags WHERE user_id = ?1`).bind(userId).first<{ count: number }>(),
        c.env.DB.prepare(
          `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
             FROM attachments WHERE user_id = ?1 ORDER BY size DESC LIMIT 5`,
        ).bind(userId).all<AttachmentRow>(),
        c.env.DB.prepare(`SELECT filename, size FROM attachments WHERE user_id = ?1`).bind(userId).all<{ filename: string; size: number }>(),
      ])

    const results = itemsResult.results
    const page = results.slice(0, params.pageSize)
    const hasMore = results.length > params.pageSize

    return c.json(
      attachmentLibraryPayload({
        page,
        hasMore,
        pageSize: params.pageSize,
        statsRow,
        references,
        folderCountRow,
        tagCountRow,
        largestRows,
        allFilesForExt,
      }),
    )
  })
}

function attachmentListParams(c: Context<AppBindings>): AttachmentListParams {
  const limitParam = Number(c.req.query('limit'))
  const pageSize = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : ATTACHMENT_LIST_PAGE_SIZE
  return {
    folderId: c.req.query('folderId'),
    type: c.req.query('type'),
    sizeRange: c.req.query('sizeRange'),
    minBytes: Number(c.req.query('minBytes')),
    maxBytes: Number(c.req.query('maxBytes')),
    tag: c.req.query('tag'),
    starred: c.req.query('starred'),
    pinned: c.req.query('pinned'),
    noteId: c.req.query('noteId'),
    extension: c.req.query('extension')?.trim().toLowerCase(),
    search: c.req.query('search')?.trim(),
    sort: c.req.query('sort') || 'date_desc',
    pageSize,
    cursor: parseAttachmentListCursor(c.req.query('cursor')),
  }
}

function buildAttachmentListQuery(
  userId: string,
  params: AttachmentListParams,
): { sql: string; bindings: unknown[] } {
  const whereClauses: string[] = ['user_id = ?']
  const bindings: unknown[] = [userId]

  pushAttachmentFilterClauses(whereClauses, bindings, params)

  if (params.cursor) {
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))')
    bindings.push(params.cursor.createdAt, params.cursor.createdAt, params.cursor.id)
  }

  const orderBy = ATTACHMENT_SORTS[params.sort] ?? ATTACHMENT_SORTS.date_desc!
  const sql = `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
     FROM attachments WHERE ${whereClauses.join(' AND ')}
     ORDER BY ${orderBy} LIMIT ?`
  bindings.push(params.pageSize + 1)
  return { sql, bindings }
}

function pushAttachmentFilterClauses(
  whereClauses: string[],
  bindings: unknown[],
  params: AttachmentListParams,
): void {
  if (params.folderId === 'unfiled') {
    whereClauses.push('folder_id IS NULL')
  } else if (params.folderId) {
    whereClauses.push('folder_id = ?')
    bindings.push(params.folderId)
  }

  if (params.extension && params.extension !== 'all') {
    const extClause = extensionLikeClauses(params.extension)
    if (extClause) {
      whereClauses.push(extClause.clause)
      bindings.push(...extClause.bindings)
    }
  }

  const typeCondition = params.type ? ATTACHMENT_TYPE_CONDITIONS[params.type] : undefined
  if (typeCondition) whereClauses.push(typeCondition)

  const sizeCondition = params.sizeRange ? SIZE_RANGE_CONDITIONS[params.sizeRange] : undefined
  if (sizeCondition) whereClauses.push(sizeCondition)

  if (Number.isFinite(params.minBytes) && params.minBytes >= 0) {
    whereClauses.push('size >= ?')
    bindings.push(params.minBytes)
  }
  if (Number.isFinite(params.maxBytes) && params.maxBytes >= 0) {
    whereClauses.push('size <= ?')
    bindings.push(params.maxBytes)
  }

  if (params.tag) {
    whereClauses.push('tags LIKE ?')
    bindings.push(`%"${params.tag}"%`)
  }
  if (params.starred === '1') whereClauses.push('is_starred = 1')
  if (params.pinned === '1') whereClauses.push('is_pinned = 1')
  if (params.noteId) {
    whereClauses.push('note_id = ?')
    bindings.push(params.noteId)
  }

  if (params.search) {
    whereClauses.push('(filename LIKE ? OR tags LIKE ?)')
    bindings.push(`%${params.search}%`, `%"${params.search}"%`)
  }
}

function extensionLikeClauses(extension: string): { clause: string; bindings: string[] } | null {
  const exts = extension
    .split(',')
    .map((e) => e.trim().replace(/^\./, ''))
    .filter(Boolean)
  if (!exts.length) return null
  return {
    clause: `(${exts.map(() => 'LOWER(filename) LIKE ?').join(' OR ')})`,
    bindings: exts.map((e) => `%.${e}`),
  }
}

async function loadAttachmentStorageStats(
  db: D1Database,
  userId: string,
): Promise<{
  total_count: number
  total_bytes: number
  image_bytes: number
  document_bytes: number
  media_bytes: number
  archive_bytes: number
  code_bytes: number
} | null> {
  return db.prepare(
    `SELECT
       COUNT(*) as total_count,
       COALESCE(SUM(size), 0) as total_bytes,
       COALESCE(SUM(CASE WHEN mime LIKE 'image/%' THEN size ELSE 0 END), 0) as image_bytes,
       COALESCE(SUM(CASE WHEN mime = 'application/pdf' OR mime LIKE 'text/%' OR mime LIKE '%document%' OR mime LIKE '%sheet%' OR mime LIKE '%presentation%' OR mime LIKE 'application/vnd.%' OR mime LIKE 'application/msword' THEN size ELSE 0 END), 0) as document_bytes,
       COALESCE(SUM(CASE WHEN mime LIKE 'audio/%' OR mime LIKE 'video/%' THEN size ELSE 0 END), 0) as media_bytes,
       COALESCE(SUM(CASE WHEN mime LIKE '%zip%' OR mime LIKE '%tar%' OR mime LIKE '%rar%' OR mime LIKE '%7z%' OR mime LIKE '%gzip%' THEN size ELSE 0 END), 0) as archive_bytes,
       COALESCE(SUM(CASE WHEN mime LIKE '%javascript%' OR mime LIKE '%json%' OR filename LIKE '%.py' OR filename LIKE '%.rs' OR filename LIKE '%.go' OR filename LIKE '%.ts' OR filename LIKE '%.js' THEN size ELSE 0 END), 0) as code_bytes
     FROM attachments WHERE user_id = ?1`,
  ).bind(userId).first<{
    total_count: number
    total_bytes: number
    image_bytes: number
    document_bytes: number
    media_bytes: number
    archive_bytes: number
    code_bytes: number
  }>()
}

interface LibraryPayloadInput {
  page: AttachmentRow[]
  hasMore: boolean
  pageSize: number
  statsRow: {
    total_count: number
    total_bytes: number
    image_bytes: number
    document_bytes: number
    media_bytes: number
    archive_bytes: number
    code_bytes: number
  } | null
  references: Map<string, number>
  folderCountRow: { count: number } | null
  tagCountRow: { count: number } | null
  largestRows: { results: AttachmentRow[] }
  allFilesForExt: { results: Array<{ filename: string; size: number }> }
}

function attachmentLibraryPayload(input: LibraryPayloadInput): object {
  const totalBytes = input.statsRow?.total_bytes ?? 0
  const imageBytes = input.statsRow?.image_bytes ?? 0
  const documentBytes = input.statsRow?.document_bytes ?? 0
  const mediaBytes = input.statsRow?.media_bytes ?? 0
  const archiveBytes = input.statsRow?.archive_bytes ?? 0
  const codeBytes = input.statsRow?.code_bytes ?? 0
  const otherBytes = Math.max(0, totalBytes - (imageBytes + documentBytes + mediaBytes + archiveBytes + codeBytes))

  return {
    files: input.page.map((row) => ({
      ...toAttachment(row),
      references: input.references.get(row.id) ?? 0,
    })),
    nextCursor: input.hasMore && input.page.length
      ? `${input.page[input.page.length - 1]!.created_at}.${input.page[input.page.length - 1]!.id}`
      : null,
    stats: {
      totalCount: input.statsRow?.total_count ?? 0,
      totalBytes,
      totalQuotaBytes: TOTAL_QUOTA_BYTES,
      imageBytes,
      documentBytes,
      mediaBytes,
      archiveBytes,
      codeBytes,
      otherBytes,
      unreferencedCount: Math.max(0, (input.statsRow?.total_count ?? 0) - input.references.size),
      folderCount: input.folderCountRow?.count ?? 0,
      tagCount: input.tagCountRow?.count ?? 0,
      extensionBreakdown: buildExtensionBreakdown(input.allFilesForExt.results),
      largestFiles: input.largestRows.results.map((row) => ({
        ...toAttachment(row),
        references: input.references.get(row.id) ?? 0,
      })),
    },
  }
}

function buildExtensionBreakdown(rows: Array<{ filename: string; size: number }>): Record<string, { count: number; bytes: number }> {
  const extensionBreakdown: Record<string, { count: number; bytes: number }> = {}
  for (const row of rows) {
    const ext = row.filename.split('.').pop()?.toLowerCase() || 'other'
    const curr = extensionBreakdown[ext] ?? { count: 0, bytes: 0 }
    curr.count += 1
    curr.bytes += row.size
    extensionBreakdown[ext] = curr
  }
  return extensionBreakdown
}