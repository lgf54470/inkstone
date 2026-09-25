import { shareStatusSql, shareTagElementSql } from '../../lib/share-selection-sql'
import type { ShareStatusFilter } from '@shared/share-selection'

// Statement builders + parsers for the share list's global stats (SH-17a):
// the list route batches these four statements with its rows query, so each
// side stays a pure piece the handler can reassemble.
//
// Every count below is a status rule from `@shared/share-selection` rather than a
// hand-written condition: the sidebar's numbers and the list's own filtered rows then
// answer the same question by construction. The record of columns is what makes that
// hold for a rule someone adds later — the counts stop compiling until it has one.

export interface ShareGlobalStats {
  totalShares: number
  activeShares: number
  pinnedShares: number
  starredShares: number
  pausedShares: number
  passwordShares: number
  expiringShares: number
  expiringSoonShares: number
  permanentShares: number
  expiredShares: number
  totalViews: number
  totalVisitors: number
  folderCounts: Record<string, { total: number; shared: number }>
  tagCounts: Record<string, { total: number; shared: number }>
}

export interface FolderCountRow {
  folder_id: string
  total_shares: number
  shared_notes: number
}

export interface TagCountRow {
  name: string
  total: number
  shared: number
}

/** The counts the response carries, one per status the sidebar shows, plus the totals. */
const STATUS_COUNT_COLUMNS: Record<Exclude<ShareStatusFilter, 'all'>, string> = {
  active: 'active_shares',
  pinned: 'pinned_shares',
  starred: 'starred_shares',
  paused: 'paused_shares',
  password: 'password_shares',
  expiring_soon: 'expiring_soon_shares',
  expiring: 'expiring_shares',
  permanent: 'permanent_shares',
  expired: 'expired_shares',
}

export interface GlobalSummaryRow {
  total_shares: number
  active_shares: number
  pinned_shares: number
  starred_shares: number
  paused_shares: number
  password_shares: number
  expiring_shares: number
  expiring_soon_shares: number
  permanent_shares: number
  expired_shares: number
  total_views: number
}

export interface FilteredStatsRow {
  total_views: number
  total_uv: number
}

export function folderCountsStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  // "Shared" in these counts means the same thing the visitor-facing `active` status means: a folder
  // whose row says 3 while the collection page shows 2 would be two answers to one question.
  const live = shareStatusSql('active', now, 2)?.sql ?? '1'
  return db.prepare(
    `SELECT sf.id as folder_id,
            COUNT(CASE WHEN s.slug IS NOT NULL AND n.deleted_at IS NULL THEN 1 END) as total_shares,
            COUNT(CASE WHEN s.slug IS NOT NULL AND n.deleted_at IS NULL AND ${live} THEN 1 END) as shared_notes
       FROM share_folders sf
       LEFT JOIN shares s ON s.folder_id = sf.id AND s.user_id = sf.user_id
       LEFT JOIN notes n ON n.id = s.note_id
      WHERE sf.user_id = ?1
      GROUP BY sf.id`,
  )
    .bind(userId, now)
}

export function toFolderCounts(rows: FolderCountRow[]): Record<string, { total: number; shared: number }> {
  const folderCounts: Record<string, { total: number; shared: number }> = {}
  for (const r of rows) {
    folderCounts[r.folder_id] = { total: r.total_shares, shared: Math.min(r.shared_notes, r.total_shares) }
  }
  return folderCounts
}

export function tagCountsStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  return db.prepare(
    `SELECT t.name AS name,
            COUNT(CASE WHEN s.slug IS NOT NULL AND n.deleted_at IS NULL THEN 1 END) AS total,
            COUNT(CASE WHEN s.slug IS NOT NULL AND n.deleted_at IS NULL AND (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) AS shared
       FROM share_tags t
       LEFT JOIN shares s ON s.user_id = t.user_id AND ${shareTagElementSql('s', 't.name')}
       LEFT JOIN notes n ON n.id = s.note_id
      WHERE t.user_id = ?1
      GROUP BY t.name`,
  ).bind(userId, now)
}

export function toTagCounts(rows: TagCountRow[]): Record<string, { total: number; shared: number }> {
  const tagCounts: Record<string, { total: number; shared: number }> = {}
  for (const row of rows) {
    tagCounts[row.name] = { total: row.total, shared: Math.min(row.shared, row.total) }
  }
  return tagCounts
}

/** One `COUNT(CASE WHEN <status rule> THEN 1 END)` per status, numbered from the account bind at `?1`. */
function statusCountSelect(now: number): { sql: string; binds: number[] } {
  const parts: string[] = []
  const binds: number[] = []
  let nextBind = 2
  for (const [status, column] of Object.entries(STATUS_COUNT_COLUMNS) as Array<[Exclude<ShareStatusFilter, 'all'>, string]>) {
    const fragment = shareStatusSql(status, now, nextBind)
    if (!fragment) continue
    parts.push(`COUNT(CASE WHEN ${fragment.sql} THEN 1 END) as ${column}`)
    binds.push(...fragment.binds as number[])
    nextBind = fragment.nextBind
  }
  return { sql: parts.join(',\n            '), binds }
}

export function globalSummaryStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  const counts = statusCountSelect(now)
  return db.prepare(
    `SELECT COUNT(*) as total_shares,
            ${counts.sql},
            COALESCE(SUM(s.views), 0) as total_views
       FROM shares s
       JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND n.deleted_at IS NULL`,
  )
    .bind(userId, ...counts.binds)
}

export function filteredGlobalStatsStatement(db: D1Database, userId: string, clause: string): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as total_views, COUNT(DISTINCT visitor_fp) as total_uv
       FROM share_visits
      WHERE user_id = ?1
        AND EXISTS (SELECT 1 FROM shares s WHERE s.slug = share_visits.slug) ${clause}`,
  )
    .bind(userId)
}

// The two unbounded aggregates above run over the account's whole visit history on every list
// request, while the number they serve is the sidebar's all-time footnote — a caliber that is not
// real-time by construction. So the answer is memoized in app_meta for a short window: a fresh
// list request pays a one-row lookup instead of the scan, and at most one request per window per
// account actually runs the aggregates. A per-isolate Map would leak user-scoped state across
// requests, which the module-state gate exists to prevent; a keyed row does the same job and
// works across isolates.
export const FILTERED_STATS_TTL_MS = 60_000

export function filteredStatsCacheKey(userId: string, clause: string): string {
  return `share:filtered-stats:${userId}:${hashClause(clause)}`
}

/** FNV-1a over the traffic clause: the vocabulary is small, but the key must stay bounded whatever lands in it. */
function hashClause(clause: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < clause.length; index++) {
    hash ^= clause.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function serializeFilteredStatsCache(value: FilteredStatsRow, now: number): string {
  return JSON.stringify({ v: value.total_views, u: value.total_uv, at: now })
}

/** Null for anything that is not a fresh, well-formed entry: a corrupt row reads as a miss. */
export function parseFilteredStatsCache(raw: string | null, now: number): FilteredStatsRow | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; u?: unknown; at?: unknown }
    if (typeof parsed.v !== 'number' || typeof parsed.u !== 'number' || typeof parsed.at !== 'number') return null
    if (!Number.isSafeInteger(parsed.v) || !Number.isSafeInteger(parsed.u)) return null
    if (now - parsed.at < 0 || now - parsed.at >= FILTERED_STATS_TTL_MS) return null
    return { total_views: parsed.v, total_uv: parsed.u }
  } catch {
    return null
  }
}

export function buildShareGlobalStats(
  folderCounts: Record<string, { total: number; shared: number }>,
  tagCounts: Record<string, { total: number; shared: number }>,
  globalSummary: GlobalSummaryRow | null,
  filteredGlobalStats: FilteredStatsRow | null,
): ShareGlobalStats {
  return {
    totalShares: globalSummary?.total_shares ?? 0,
    activeShares: globalSummary?.active_shares ?? 0,
    pinnedShares: globalSummary?.pinned_shares ?? 0,
    starredShares: globalSummary?.starred_shares ?? 0,
    pausedShares: globalSummary?.paused_shares ?? 0,
    passwordShares: globalSummary?.password_shares ?? 0,
    expiringShares: globalSummary?.expiring_shares ?? 0,
    expiringSoonShares: globalSummary?.expiring_soon_shares ?? 0,
    permanentShares: globalSummary?.permanent_shares ?? 0,
    expiredShares: globalSummary?.expired_shares ?? 0,
    totalViews: filteredGlobalStats?.total_views ?? (globalSummary?.total_views ?? 0),
    totalVisitors: filteredGlobalStats?.total_uv ?? 0,
    folderCounts,
    tagCounts,
  }
}
