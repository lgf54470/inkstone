import { Hono } from 'hono'
import { ShareInfo, ShareListResponse, ShareStatsResponse, ShareSummaryResponse } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { EXPIRING_SOON_DAYS } from '@shared/constants'
import { escapeLike } from '../../lib/like'
import { buildVisitFilterSql, type ShareFilterOptions } from '../../lib/share-analytics'
import {
  buildShareGlobalStats,
  folderCountsStatement,
  filteredGlobalStatsStatement,
  globalSummaryStatement,
  pinStarStatement,
  tagCountsStatement,
  toFolderCounts,
  toTagCounts,
  type FilteredStatsRow,
  type FolderCountRow,
  type GlobalSummaryRow,
  type PinStarRow,
  type TagCountRow,
} from './global-stats'
import { firstOf, rowsOf, type D1ReadResult } from './read-results'

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
  registerShareStatsRoute(shareManageRoutes)
  registerShareSummaryRoute(shareManageRoutes)
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

/**
 * The counters behind the sidebar and the list's own totals are the same five
 * aggregates, so they are described once and batched by whoever needs them: the
 * list puts them beside its row query (still one round trip), while `/stats` asks
 * for them alone — a hub that lands on the dashboard reads the counts, not the rows.
 */
function globalStatsStatements(db: D1Database, userId: string, now: number, clause: string): D1PreparedStatement[] {
  return [
    folderCountsStatement(db, userId, now),
    tagCountsStatement(db, userId, now),
    globalSummaryStatement(db, userId, now),
    filteredGlobalStatsStatement(db, userId, clause),
    pinStarStatement(db, userId),
  ]
}

function parseGlobalStats(results: D1ReadResult[]): ShareListResponse['globalStats'] {
  const [folderResult, tagResult, summaryResult, filteredResult, pinStarResult] = results
  return buildShareGlobalStats(
    toFolderCounts(rowsOf<FolderCountRow>(folderResult)),
    toTagCounts(rowsOf<TagCountRow>(tagResult)),
    firstOf<GlobalSummaryRow>(summaryResult),
    firstOf<FilteredStatsRow>(filteredResult),
    firstOf<PinStarRow>(pinStarResult),
  )
}

function registerShareListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const params = shareListParams(c)
    const binds: Array<string | number> = [userId]
    const conditions = shareListConditions(binds, params)
    const results = await db.batch([
      ...globalStatsStatements(db, userId, params.now, params.clause),
      shareListRowsStatement(db, binds, conditions, shareListOrderClause(params.sort)),
    ])
    const globalStats = parseGlobalStats(results)
    const rows = rowsOf<ShareListRow>(results[QUERY_COUNT_FOR_LIST_ROWS])
    const truncated = rows.length > SHARE_LIST_ROW_LIMIT
    const visibleRows = truncated ? rows.slice(0, SHARE_LIST_ROW_LIMIT) : rows
    const noteStatsMap = await loadNoteVisitStats(db, userId, visibleRows, params.clause)
    const shares = visibleRows.map((r) => shareListInfo(r, noteStatsMap.get(r.note_id), params.origin))
    const response: ShareListResponse = {
      shares,
      total: shares.length,
      truncated,
      globalStats,
    }
    return c.json(response)
  })
}

function registerShareStatsRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/stats', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const params = shareListParams(c)
    const results = await db.batch(globalStatsStatements(db, userId, params.now, params.clause))
    const response: ShareStatsResponse = { globalStats: parseGlobalStats(results) }
    return c.json(response)
  })
}

function registerShareSummaryRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/summary', async (c) => {
    const userId = c.get('userId')
    const { results } = await c.env.DB.prepare(`SELECT note_id FROM shares WHERE user_id = ?1`)
      .bind(userId)
      .all<{ note_id: string }>()
    const sharedNoteIds = (results ?? []).map((r) => r.note_id)
    const response: ShareSummaryResponse = { totalShares: sharedNoteIds.length, sharedNoteIds }
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

/**
 * The status categories that read the clock. Each returns its SQL with bare `?` placeholders plus
 * the values they take, so the caller can hand out binding numbers in the order it builds the
 * clause — the categories that need no clock ride along in STATUS_CONDITIONS below.
 */
function statusTimeCondition(status: string, now: number): { sql: string; binds: Array<string | number> } | null {
  if (status === 'active')
    return { sql: `(s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?)`, binds: [now] }
  if (status === 'expired')
    return { sql: `s.expires_at IS NOT NULL AND s.expires_at <= ?`, binds: [now] }
  if (status === 'expiring')
    return { sql: `s.expires_at IS NOT NULL AND s.expires_at > ?`, binds: [now] }
  if (status === 'expiring_soon')
    return { sql: `s.expires_at IS NOT NULL AND s.expires_at > ? AND s.expires_at <= ?`, binds: [now, now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000] }
  return null
}

// The list batch is the five aggregate statements above, then its row query.
const QUERY_COUNT_FOR_LIST_ROWS = 5

const STATUS_CONDITIONS: Record<string, string> = {
  paused: `s.is_enabled = 0`,
  starred: `n.is_starred = 1`,
  pinned: `n.is_pinned = 1`,
  password: `s.password_hash IS NOT NULL`,
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
    conditions.push(`s.tags LIKE ?${bindIndex} ESCAPE '\\'`)
    binds.push(`%"${escapeLike(tag)}"%`)
    bindIndex++
  }
  const timeCondition = statusTimeCondition(status, now)
  if (timeCondition) {
    conditions.push(timeCondition.sql.replace(/\?/g, () => `?${bindIndex++}`))
    binds.push(...timeCondition.binds)
  }
  const staticCondition = STATUS_CONDITIONS[status]
  if (staticCondition) conditions.push(staticCondition)
  if (search) {
    conditions.push(`(n.title LIKE ?${bindIndex} ESCAPE '\\' OR n.excerpt LIKE ?${bindIndex} ESCAPE '\\' OR s.slug LIKE ?${bindIndex} ESCAPE '\\' OR s.tags LIKE ?${bindIndex} ESCAPE '\\')`)
    binds.push(`%${escapeLike(search)}%`)
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

const SHARE_LIST_ROW_LIMIT = 500

function shareListRowsStatement(
  db: D1Database,
  binds: Array<string | number>,
  conditions: string[],
  orderClause: string,
): D1PreparedStatement {
  return db.prepare(`
    SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt,
           n.is_pinned, n.is_starred,
           s.slug, s.folder_id, s.tags as share_tags_json,
           s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE ${conditions.join(' AND ')}
     ${orderClause}
     LIMIT ${SHARE_LIST_ROW_LIMIT + 1}
  `)
    .bind(...binds)
}

const VISIT_STATS_NOTE_CHUNK = 50

/**
 * Per-note pageview/visitor totals for the visible rows. The owner predicate is the
 * point of interest: `share_visits.user_id` is the share's owner, so scoping by it
 * changes no result, but it is what makes the planner search `idx_share_visits_filter_time`
 * instead of relying on the slug subquery alone. A covering index was measured for this
 * query and deliberately not added — see the SH-73 note in the repair ledger: it needed
 * `(note_id, is_bot, visitor_fp, slug)` to pay off, which is write amplification on the
 * table every public page view inserts into, for a read only the owner's hub performs.
 */
async function loadNoteVisitStats(
  db: D1Database,
  userId: string,
  rows: ShareListRow[],
  clause: string,
): Promise<Map<string, { pvs: number; uvs: number }>> {
  const noteStatsMap = new Map<string, { pvs: number; uvs: number }>()
  const noteIds = rows.map((r) => r.note_id)
  const statements: D1PreparedStatement[] = []
  for (let index = 0; index < noteIds.length; index += VISIT_STATS_NOTE_CHUNK) {
    const chunk = noteIds.slice(index, index + VISIT_STATS_NOTE_CHUNK)
    const placeholders = chunk.map(() => '?').join(',')
    statements.push(db.prepare(
      `SELECT note_id, COUNT(*) as pvs, COUNT(DISTINCT visitor_fp) as uvs
         FROM share_visits
        WHERE user_id = ?1
          AND note_id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM shares s WHERE s.slug = share_visits.slug) ${clause}
        GROUP BY note_id`,
    )
      .bind(userId, ...chunk))
  }
  if (!statements.length) return noteStatsMap
  const statsResults = await db.batch(statements)
  for (const result of statsResults) {
    for (const sr of rowsOf<{ note_id: string; pvs: number; uvs: number }>(result)) {
      noteStatsMap.set(sr.note_id, { pvs: sr.pvs, uvs: sr.uvs })
    }
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
