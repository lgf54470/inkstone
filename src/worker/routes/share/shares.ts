import { Hono } from 'hono';
import { ShareInfo, ShareListResponse } from '@shared/types';
import type { AppBindings } from '../../env';
import { ApiError } from '../../lib/errors';
import { buildVisitFilterSql, type ShareFilterOptions } from '../../lib/share-analytics';

export interface ShareRow {
  slug: string
  note_id: string
  user_id: string
  folder_id?: string | null
  tags?: string
  password_hash: string | null
  expires_at: number | null
  views: number
  is_enabled: number
  last_viewed_at: number | null
  created_at: number
}

interface ShareListRow {
  note_id: string
  note_title: string
  note_excerpt: string
  is_pinned: number
  is_starred: number
  slug: string | null
  folder_id: string | null
  share_tags_json: string | null
  password_hash: string | null
  expires_at: number | null
  views: number | null
  is_enabled: number | null
  last_viewed_at: number | null
  created_at: number | null
}

interface ShareListParams {
  folderId: string | null
  tag: string | null
  status: string
  search: string
  sort: string
  clause: string
  now: number
  origin: string
}

export function toShareInfo(
  row: ShareRow,
  origin: string,
  extras?: {
    noteTitle?: string
    noteExcerpt?: string
    folderId?: string | null
    tags?: string[]
    uniqueVisitors?: number
    isPinned?: boolean
    isStarred?: boolean
  },
): ShareInfo {
  const parsedTags = shareRowTags(row, extras)
  const shareFolderId = extras?.folderId !== undefined ? extras.folderId : (row.folder_id ?? null)
  return {
    slug: row.slug,
    noteId: row.note_id,
    url: `${origin}/s/${row.slug}`,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    views: row.views,
    createdAt: row.created_at,
    isEnabled: row.is_enabled !== 0,
    lastViewedAt: row.last_viewed_at ?? null,
    uniqueVisitors: extras?.uniqueVisitors,
    noteTitle: extras?.noteTitle,
    noteExcerpt: extras?.noteExcerpt,
    shareFolderId,
    folderId: shareFolderId,
    shareTags: parsedTags,
    tags: parsedTags,
    isPinned: extras?.isPinned,
    isStarred: extras?.isStarred,
  }
}

export function registerShareSharingRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareNoteShareRoute(shareManageRoutes)
  registerShareListRoute(shareManageRoutes)
}

function registerShareNoteShareRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/note-share/:noteId', async (c) => {
    const userId = c.get('userId')
    const noteId = c.req.param('noteId')
    const row = await loadShareListRow(c.env.DB, userId, noteId)
    if (!row) throw ApiError.notFound('Note not found')
    if (!row.slug) {
      return c.json({
        share: null,
        noteTitle: row.note_title,
        isPinned: row.is_pinned === 1,
        isStarred: row.is_starred === 1,
      })
    }
    return c.json(noteSharePayload(row, new URL(c.req.url).origin))
  })
}

function registerShareListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/', async (c) => {
    const userId = c.get('userId')
    const params = shareListParams(c)
    const globalStats = await loadShareGlobalStats(c.env.DB, userId, params.now, params.clause)
    const binds: Array<string | number> = [userId]
    const conditions = shareListConditions(binds, params)
    const orderClause = shareListOrderClause(params.sort)
    const rows = await loadShareListRows(c.env.DB, binds, conditions, orderClause)
    const noteStatsMap = await loadNoteVisitStats(c.env.DB, rows, params.clause)
    const shares = rows.map((r) => shareListInfo(r, noteStatsMap.get(r.note_id), params.origin))
    const response: ShareListResponse = {
      shares,
      total: shares.length,
      globalStats,
    }
    return c.json(response)
  })
}

function shareListParams(c: { req: { query(key: string): string | undefined; url: string } }): ShareListParams {
  const rawFolderId = c.req.query('folderId')
  const folderId = rawFolderId && rawFolderId !== 'null' && rawFolderId !== 'undefined' ? rawFolderId : null
  const rawTag = c.req.query('tag')
  const tag = rawTag && rawTag !== 'null' && rawTag !== 'undefined' ? rawTag : null
  const status = c.req.query('status') || 'all'
  const search = (c.req.query('search') || '').trim()
  const sort = c.req.query('sort') || 'views_desc'
  const filters: ShareFilterOptions = {
    excludeBots: c.req.query('excludeBots') !== 'false',
    excludeSelfReferrers: c.req.query('excludeSelf') === 'true',
    excludeOwner: c.req.query('excludeOwner') === 'true',
  }
  return {
    folderId,
    tag,
    status,
    search,
    sort,
    clause: buildVisitFilterSql(filters),
    now: Date.now(),
    origin: new URL(c.req.url).origin,
  }
}

interface ShareGlobalStats {
  totalShares: number
  activeShares: number
  pinnedShares: number
  starredShares: number
  pausedShares: number
  expiredShares: number
  totalViews: number
  totalVisitors: number
  folderCounts: Record<string, { total: number; shared: number }>
  tagCounts: Record<string, { total: number; shared: number }>
}

async function loadShareFolderCounts(db: D1Database, userId: string, now: number): Promise<Record<string, { total: number; shared: number }>> {
  const rows = await db.prepare(
    `SELECT sf.id as folder_id,
            COUNT(s.slug) as total_shares,
            COUNT(CASE WHEN s.slug IS NOT NULL AND (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) as shared_notes
       FROM share_folders sf
       LEFT JOIN shares s ON s.folder_id = sf.id AND s.user_id = sf.user_id
      WHERE sf.user_id = ?1
      GROUP BY sf.id`,
  )
    .bind(userId, now)
    .all<{ folder_id: string; total_shares: number; shared_notes: number }>()
  const folderCounts: Record<string, { total: number; shared: number }> = {}
  for (const r of rows.results ?? []) {
    folderCounts[r.folder_id] = { total: r.total_shares, shared: Math.min(r.shared_notes, r.total_shares) }
  }
  return folderCounts
}

async function loadShareTagCounts(db: D1Database, userId: string, now: number): Promise<Record<string, { total: number; shared: number }>> {
  const allShareTags = await db.prepare(
    `SELECT name FROM share_tags WHERE user_id = ?1`,
  ).bind(userId).all<{ name: string }>()
  const tagCounts: Record<string, { total: number; shared: number }> = {}
  for (const t of allShareTags.results ?? []) {
    const tRow = await db.prepare(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?3) THEN 1 END) as shared
         FROM shares
        WHERE user_id = ?1 AND tags LIKE ?2`,
    ).bind(userId, `%"${t.name}"%`, now).first<{ total: number; shared: number }>()
    tagCounts[t.name] = { total: tRow?.total ?? 0, shared: Math.min(tRow?.shared ?? 0, tRow?.total ?? 0) }
  }
  return tagCounts
}

async function loadShareGlobalStats(db: D1Database, userId: string, now: number, clause: string): Promise<ShareGlobalStats> {
  const folderCounts = await loadShareFolderCounts(db, userId, now)
  const tagCounts = await loadShareTagCounts(db, userId, now)
  const globalSummary = await db.prepare(
    `SELECT COUNT(*) as total_shares,
            COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
            COUNT(CASE WHEN is_enabled = 0 THEN 1 END) as paused_shares,
            COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ?2 THEN 1 END) as expired_shares,
            COALESCE(SUM(views), 0) as total_views
       FROM shares
      WHERE user_id = ?1`,
  )
    .bind(userId, now)
    .first<{ total_shares: number; active_shares: number; paused_shares: number; expired_shares: number; total_views: number }>()
  const filteredGlobalStats = await db.prepare(
    `SELECT COUNT(*) as total_views, COUNT(DISTINCT visitor_fp) as total_uv
       FROM share_visits
      WHERE user_id = ?1 ${clause}`,
  )
    .bind(userId)
    .first<{ total_views: number; total_uv: number }>()
  const pinStarRow = await db.prepare(
    `SELECT
       COUNT(CASE WHEN n.is_pinned = 1 THEN 1 END) as pinned_shares,
       COUNT(CASE WHEN n.is_starred = 1 THEN 1 END) as starred_shares
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE s.user_id = ?1 AND n.deleted_at IS NULL`,
  ).bind(userId).first<{ pinned_shares: number; starred_shares: number }>()

  return {
    totalShares: globalSummary?.total_shares ?? 0,
    activeShares: globalSummary?.active_shares ?? 0,
    pinnedShares: pinStarRow?.pinned_shares ?? 0,
    starredShares: pinStarRow?.starred_shares ?? 0,
    pausedShares: globalSummary?.paused_shares ?? 0,
    expiredShares: globalSummary?.expired_shares ?? 0,
    totalViews: filteredGlobalStats?.total_views ?? (globalSummary?.total_views ?? 0),
    totalVisitors: filteredGlobalStats?.total_uv ?? 0,
    folderCounts,
    tagCounts,
  }
}

const STATUS_CONDITIONS: Record<string, string> = {
  paused: `s.is_enabled = 0`,
  starred: `n.is_starred = 1`,
  pinned: `n.is_pinned = 1`,
  password: `s.password_hash IS NOT NULL`,
  expiring: `s.expires_at IS NOT NULL`,
  permanent: `s.expires_at IS NULL`,
}

function shareListConditions(binds: Array<string | number>, params: ShareListParams): string[] {
  const { folderId, tag, status, search, now } = params
  const conditions: string[] = [`s.user_id = ?1`, `n.deleted_at IS NULL`]
  let bindIndex = 2
  if (folderId) {
    conditions.push(`s.folder_id = ?${bindIndex}`)
    binds.push(folderId)
    bindIndex++
  }
  if (tag) {
    conditions.push(`s.tags LIKE ?${bindIndex}`)
    binds.push(`%"${tag}"%`)
    bindIndex++
  }
  if (status === 'active') {
    conditions.push(`(s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?${bindIndex})`)
    binds.push(now)
    bindIndex++
  } else if (status === 'expired') {
    conditions.push(`s.expires_at IS NOT NULL AND s.expires_at <= ?${bindIndex}`)
    binds.push(now)
    bindIndex++
  }
  const staticCondition = STATUS_CONDITIONS[status]
  if (staticCondition) conditions.push(staticCondition)
  if (search) {
    conditions.push(`(n.title LIKE ?${bindIndex} OR n.excerpt LIKE ?${bindIndex} OR s.slug LIKE ?${bindIndex} OR s.tags LIKE ?${bindIndex})`)
    binds.push(`%${search}%`)
    bindIndex++
  }
  return conditions
}

const SHARE_ORDERS: Record<string, string> = {
  views_asc: `ORDER BY n.is_pinned DESC, s.views ASC, n.updated_at DESC`,
  recent_visit: `ORDER BY n.is_pinned DESC, s.last_viewed_at IS NOT NULL DESC, s.last_viewed_at DESC, n.updated_at DESC`,
  created_desc: `ORDER BY n.is_pinned DESC, s.created_at IS NOT NULL DESC, s.created_at DESC, n.created_at DESC`,
  title_asc: `ORDER BY n.is_pinned DESC, n.title ASC`,
  expires_asc: `ORDER BY n.is_pinned DESC, s.expires_at IS NULL, s.expires_at ASC, n.updated_at DESC`,
}

function shareListOrderClause(sort: string): string {
  return SHARE_ORDERS[sort] ?? `ORDER BY n.is_pinned DESC, s.views DESC, n.updated_at DESC`
}

async function loadShareListRow(db: D1Database, userId: string, noteId: string): Promise<ShareListRow | null> {
  return db.prepare(
    `SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt, n.is_pinned, n.is_starred,
            s.slug, s.folder_id, s.tags as share_tags_json, s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
       FROM notes n
       LEFT JOIN shares s ON s.note_id = n.id AND s.user_id = n.user_id
      WHERE n.id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  ).bind(noteId, userId).first<ShareListRow>()
}

async function loadShareListRows(db: D1Database, binds: Array<string | number>, conditions: string[], orderClause: string): Promise<ShareListRow[]> {
  const query = `
    SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt,
           n.is_pinned, n.is_starred,
           s.slug, s.folder_id, s.tags as share_tags_json,
           s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE ${conditions.join(' AND ')}
     ${orderClause}
     LIMIT 500
  `
  const rows = await db.prepare(query)
    .bind(...binds)
    .all<ShareListRow>()
  return rows.results ?? []
}

async function loadNoteVisitStats(
  db: D1Database,
  rows: ShareListRow[],
  clause: string,
): Promise<Map<string, { pvs: number; uvs: number }>> {
  const noteStatsMap = new Map<string, { pvs: number; uvs: number }>()
  const noteIds = rows.map((r) => r.note_id)
  if (!noteIds.length) return noteStatsMap
  const placeholders = noteIds.map(() => '?').join(',')
  const statsRows = await db.prepare(
    `SELECT note_id, COUNT(*) as pvs, COUNT(DISTINCT visitor_fp) as uvs
       FROM share_visits
      WHERE note_id IN (${placeholders}) ${clause}
      GROUP BY note_id`,
  )
    .bind(...noteIds)
    .all<{ note_id: string; pvs: number; uvs: number }>()
  for (const sr of statsRows.results ?? []) {
    noteStatsMap.set(sr.note_id, { pvs: sr.pvs, uvs: sr.uvs })
  }
  return noteStatsMap
}

function noteSharePayload(row: ShareListRow, origin: string): {
  share: ShareInfo
  noteTitle: string
  isPinned: boolean
  isStarred: boolean
} {
  const shareTags = parseShareTagsJson(row.share_tags_json)
  return {
    share: {
      slug: row.slug!,
      noteId: row.note_id,
      url: `${origin}/s/${row.slug}`,
      hasPassword: Boolean(row.password_hash),
      expiresAt: row.expires_at,
      views: row.views ?? 0,
      createdAt: row.created_at ?? 0,
      isEnabled: row.is_enabled !== 0,
      lastViewedAt: row.last_viewed_at ?? null,
      noteTitle: row.note_title,
      noteExcerpt: row.note_excerpt,
      shareFolderId: row.folder_id,
      folderId: row.folder_id,
      shareTags,
      tags: shareTags,
      isPinned: row.is_pinned === 1,
      isStarred: row.is_starred === 1,
    },
    noteTitle: row.note_title,
    isPinned: row.is_pinned === 1,
    isStarred: row.is_starred === 1,
  }
}

function shareListInfo(row: ShareListRow, stats: { pvs: number; uvs: number } | undefined, origin: string): ShareInfo {
  const noteViews = stats ? stats.pvs : (row.views ?? 0)
  const noteVisitors = stats ? stats.uvs : 0
  const parsedTags = parseShareTagsJson(row.share_tags_json)
  return {
    slug: row.slug!,
    noteId: row.note_id,
    url: `${origin}/s/${row.slug}`,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at ?? null,
    views: noteViews,
    createdAt: row.created_at ?? 0,
    isEnabled: row.is_enabled !== 0,
    lastViewedAt: row.last_viewed_at ?? null,
    uniqueVisitors: noteVisitors,
    noteTitle: row.note_title,
    noteExcerpt: row.note_excerpt,
    shareFolderId: row.folder_id,
    folderId: row.folder_id,
    shareTags: parsedTags,
    tags: parsedTags,
    isPinned: row.is_pinned === 1,
    isStarred: row.is_starred === 1,
  }
}

function parseShareTagsJson(raw: string | null): string[] {
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[share] failed to parse share tags, falling back to empty list', error)
    return []
  }
}

function shareRowTags(row: ShareRow, extras?: { tags?: string[] }): string[] {
  if (extras?.tags) return extras.tags
  if (!row.tags) return []
  try {
    return JSON.parse(row.tags)
  } catch {
    return []
  }
}
