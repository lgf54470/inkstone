// Statement builders + parsers for the share list's global stats (SH-17a):
// the list route batches these five statements with its rows query, so each
// side stays a pure piece the handler can reassemble.

export interface ShareGlobalStats {
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

export interface GlobalSummaryRow {
  total_shares: number
  active_shares: number
  paused_shares: number
  expired_shares: number
  total_views: number
}

export interface FilteredStatsRow {
  total_views: number
  total_uv: number
}

export interface PinStarRow {
  pinned_shares: number
  starred_shares: number
}

export function folderCountsStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  return db.prepare(
    `SELECT sf.id as folder_id,
            COUNT(s.slug) as total_shares,
            COUNT(CASE WHEN s.slug IS NOT NULL AND (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) as shared_notes
       FROM share_folders sf
       LEFT JOIN shares s ON s.folder_id = sf.id AND s.user_id = sf.user_id
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
            COUNT(s.slug) AS total,
            COUNT(CASE WHEN (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) AS shared
       FROM share_tags t
       LEFT JOIN shares s ON s.user_id = t.user_id AND s.tags LIKE '%' || '"' || t.name || '"' || '%'
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

export function globalSummaryStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as total_shares,
            COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
            COUNT(CASE WHEN is_enabled = 0 THEN 1 END) as paused_shares,
            COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ?2 THEN 1 END) as expired_shares,
            COALESCE(SUM(views), 0) as total_views
       FROM shares
      WHERE user_id = ?1`,
  )
    .bind(userId, now)
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

export function pinStarStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT
       COUNT(CASE WHEN n.is_pinned = 1 THEN 1 END) as pinned_shares,
       COUNT(CASE WHEN n.is_starred = 1 THEN 1 END) as starred_shares
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE s.user_id = ?1 AND n.deleted_at IS NULL`,
  ).bind(userId)
}

export function buildShareGlobalStats(
  folderCounts: Record<string, { total: number; shared: number }>,
  tagCounts: Record<string, { total: number; shared: number }>,
  globalSummary: GlobalSummaryRow | null,
  filteredGlobalStats: FilteredStatsRow | null,
  pinStarRow: PinStarRow | null,
): ShareGlobalStats {
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
