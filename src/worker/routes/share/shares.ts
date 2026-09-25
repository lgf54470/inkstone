import { Hono } from 'hono'
import { ShareInfo, ShareListResponse, ShareStatsResponse, ShareSummaryResponse } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError, errorMessage } from '../../lib/errors'
import { escapeLike } from '../../lib/like'
import { isShareStatusFilter, type ShareStatusFilter, type VisitTrafficFilters } from '@shared/share-selection'
import { shareSelectionSql, visitTrafficSql } from '../../lib/share-selection-sql'
import {
  buildShareGlobalStats,
  filteredStatsCacheKey,
  folderCountsStatement,
  filteredGlobalStatsStatement,
  globalSummaryStatement,
  parseFilteredStatsCache,
  serializeFilteredStatsCache,
  tagCountsStatement,
  toFolderCounts,
  toTagCounts,
  type FilteredStatsRow,
  type FolderCountRow,
  type GlobalSummaryRow,
  type TagCountRow,
} from './global-stats'
import { getMeta, setMeta } from '../../db/metadata'
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
  status: ShareStatusFilter
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
 * The counters behind the sidebar and the list's own totals are the same four
 * aggregates, so they are described once and batched by whoever needs them: the
 * list puts them beside its row query (still one round trip), while `/stats` asks
 * for them alone — a hub that lands on the dashboard reads the counts, not the rows.
 * The pin and star counts ride the summary statement itself, since they read the same
 * join: a second statement would have been a second definition of "a pinned share".
 *
 * The one expensive member is the filtered views/UV aggregate: it walks the account's
 * whole visit history. Its answer is the all-time footnote, so a fresh memo in app_meta
 * serves it and the batch shrinks to the three cheap statements; the memo is refilled
 * by whichever request finds it stale.
 */
interface GlobalStatsPlan {
  statements: D1PreparedStatement[]
  /** Non-null when the filtered aggregate is served from the memo and the batch omits it. */
  cachedFiltered: FilteredStatsRow | null
}

async function globalStatsPlan(db: D1Database, userId: string, params: ShareListParams): Promise<GlobalStatsPlan> {
  const raw = await getMeta(db, filteredStatsCacheKey(userId, params.clause))
  const cachedFiltered = parseFilteredStatsCache(raw, params.now)
  const statements: D1PreparedStatement[] = [
    folderCountsStatement(db, userId, params.now),
    tagCountsStatement(db, userId, params.now),
    globalSummaryStatement(db, userId, params.now),
  ]
  if (!cachedFiltered) statements.push(filteredGlobalStatsStatement(db, userId, params.clause))
  return { statements, cachedFiltered }
}

function parseGlobalStats(
  folderResult: D1ReadResult,
  tagResult: D1ReadResult,
  summaryResult: D1ReadResult,
  filtered: FilteredStatsRow | null,
): ShareListResponse['globalStats'] {
  return buildShareGlobalStats(
    toFolderCounts(rowsOf<FolderCountRow>(folderResult)),
    toTagCounts(rowsOf<TagCountRow>(tagResult)),
    firstOf<GlobalSummaryRow>(summaryResult),
    filtered,
  )
}

function registerShareListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const params = shareListParams(c)
    const binds: Array<string | number> = [userId]
    const conditions = shareListConditions(binds, params)
    const { statements, cachedFiltered } = await globalStatsPlan(db, userId, params)
    const results = await db.batch([
      ...statements,
      shareListRowsStatement(db, binds, conditions, shareListOrderClause(params.sort)),
    ])
    const filtered = filteredValue(cachedFiltered, results, statements.length)
    const globalStats = parseGlobalStats(results[0], results[1], results[2], filtered)
    const rows = rowsOf<ShareListRow>(results[results.length - 1])
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
    await rememberFilteredStats(db, userId, params, cachedFiltered, filtered)
    return c.json(response)
  })
}

function registerShareStatsRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/stats', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const params = shareListParams(c)
    const { statements, cachedFiltered } = await globalStatsPlan(db, userId, params)
    const results = await db.batch(statements)
    const filtered = filteredValue(cachedFiltered, results, statements.length)
    const globalStats = parseGlobalStats(results[0], results[1], results[2], filtered)
    const response: ShareStatsResponse = { globalStats }
    await rememberFilteredStats(db, userId, params, cachedFiltered, filtered)
    return c.json(response)
  })
}

/** The cached answer when there is one; otherwise the batch's own filtered aggregate. */
function filteredValue(
  cachedFiltered: FilteredStatsRow | null,
  results: D1ReadResult[],
  filteredIndex: number,
): FilteredStatsRow | null {
  if (cachedFiltered) return cachedFiltered
  return firstOf<FilteredStatsRow>(results[filteredIndex - 1] ?? null)
}

/** Refills the memo only when this request actually computed the aggregate. */
async function rememberFilteredStats(
  db: D1Database,
  userId: string,
  params: ShareListParams,
  cachedFiltered: FilteredStatsRow | null,
  filtered: FilteredStatsRow | null,
): Promise<void> {
  if (cachedFiltered || !filtered) return
  await setMeta(db, filteredStatsCacheKey(userId, params.clause), serializeFilteredStatsCache(filtered, params.now))
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
  const status = shareStatusParam(c.req.query('status'))
  const search = (c.req.query('search') || '').trim()
  const sort = c.req.query('sort') || 'views_desc'
  const filters: VisitTrafficFilters = {
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
    clause: visitTrafficSql(filters),
    now: Date.now(),
    origin: new URL(c.req.url).origin,
  }
}

/**
 * The status the query asked for. An unknown one is refused rather than folded into `all`: a filter
 * the server silently ignores looks like a filter that found nothing, and the client's own category
 * mapping is close enough to this vocabulary that only a bug can send anything else.
 */
function shareStatusParam(raw: string | undefined): ShareStatusFilter {
  if (!raw) return 'all'
  if (!isShareStatusFilter(raw)) throw ApiError.badRequest(`Unknown status filter: ${raw}`)
  return raw
}

/**
 * The list's selection: the two conditions that describe the rows at all, then the rules.
 *
 * `?tag=` carries the value a share stores — a tag *name*, the element of its tag array — while
 * `?folderId=` carries a folder id, and both are what the sidebar had in hand when the owner picked
 * them. An address by record id comes from a published collection, which resolves it first (see
 * `lib/share-collections`); that conversion is deliberately not repeated here.
 */
function shareListConditions(binds: Array<string | number>, params: ShareListParams): string[] {
  const { folderId, tag, status, search, now } = params
  const conditions: string[] = [`s.user_id = ?1`, `n.deleted_at IS NULL`]
  const target = folderId ? { type: 'folder' as const, value: folderId } : tag ? { type: 'tag' as const, value: tag } : null
  const selection = shareSelectionSql({ status, target }, { now, firstBind: 2 })
  conditions.push(...selection.conditions)
  binds.push(...selection.binds)
  if (search) {
    // A text search over the row, not the tag rule: the owner typing "res" means to match a share
    // whose tags contain it, and narrowing this to whole elements would stop the search working.
    const bindIndex = selection.nextBind
    conditions.push(`(n.title LIKE ?${bindIndex} ESCAPE '\\' OR n.excerpt LIKE ?${bindIndex} ESCAPE '\\' OR s.slug LIKE ?${bindIndex} ESCAPE '\\' OR s.tags LIKE ?${bindIndex} ESCAPE '\\')`)
    binds.push(`%${escapeLike(search)}%`)
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

/**
 * Valid JSON that is not an array of tags is not a tag list either: a stored scalar or object would
 * otherwise reach the payload as `tags`, and every caller's `.includes` would be reading it as one.
 * The tag rule in `@shared/share-selection` asks "is this an element of the array", so what the
 * payload calls an array has to be one.
 */
function parseShareTagsJson(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('[share] failed to parse share tags, falling back to empty list:', errorMessage(error))
    return []
  }
}

function shareRowTags(row: ShareRow, extras?: { tags?: string[] }): string[] {
  if (extras?.tags) return extras.tags
  return parseShareTagsJson(row.tags ?? null)
}
