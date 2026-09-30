import type { BlogLinkStats } from '@shared/types'
import { escapeLike, likeAny } from '../../lib/like'

/**
 * A link list past this many rows is no longer a list anyone reads; the tab counts still report the
 * true totals, so the client can say it is showing the first page rather than dropping rows quietly.
 */
export const BLOG_LINKS_LIST_LIMIT = 500

/** The link tabs pick a status or one of the two flags the reader can pin star-wise. */
export const BLOG_LINK_STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'pinned', 'favorite'] as const
export type BlogLinkStatusFilter = (typeof BLOG_LINK_STATUS_FILTERS)[number]

/**
 * What each tab means in SQL. The fragments are constants keyed by the validated filter, so a
 * request can select a condition but never write one.
 */
const BLOG_LINK_FILTER_SQL: Record<BlogLinkStatusFilter, string> = {
  all: '',
  pending: " AND status = 'pending'",
  approved: " AND status = 'approved'",
  rejected: " AND status = 'rejected'",
  pinned: ' AND is_pinned = 1',
  favorite: ' AND is_favorite = 1',
}

export interface BlogLinksFilter {
  status: BlogLinkStatusFilter
  categoryId?: string
  search?: string
}

export interface BlogLinkCountsRow {
  status: string
  count: number
  pinned: number | null
  favorite: number | null
}

export function isBlogLinkStatusFilter(value: string): value is BlogLinkStatusFilter {
  return (BLOG_LINK_STATUS_FILTERS as readonly string[]).includes(value)
}

/**
 * The `WHERE` shared by the list and the counts. `withStatus` is what separates them: the page shows
 * one status (or flag) at a time, while each badge answers "how many are in this bucket", so it must
 * not shrink when the reader switches tabs. Category and search do apply to both — the badges should
 * describe the rows the reader is looking at.
 */
function blogLinksWhereSql(
  userId: string,
  filter: BlogLinksFilter,
  withStatus: boolean,
): { sql: string; params: unknown[] } {
  let sql = ' WHERE user_id = ?1'
  const params: unknown[] = [userId]
  let idx = 2

  if (withStatus) sql += BLOG_LINK_FILTER_SQL[filter.status]

  if (filter.categoryId) {
    sql += ` AND category_id = ?${idx++}`
    params.push(filter.categoryId)
  }

  if (filter.search) {
    // Escaped like every other needle: an unescaped `%` would match every link of the account.
    sql += ` AND (${likeAny(['name', 'url', 'description', 'email'], `?${idx}`)})`
    params.push(`%${escapeLike(filter.search)}%`)
    idx++
  }

  return { sql, params }
}

export function blogLinksListQuery(userId: string, filter: BlogLinksFilter): { sql: string; params: unknown[] } {
  const where = blogLinksWhereSql(userId, filter, true)
  return {
    sql: `
      SELECT * FROM blog_links${where.sql}
      ORDER BY is_pinned DESC, pinned_order ASC, sort_order ASC, created_at DESC
      LIMIT ${BLOG_LINKS_LIST_LIMIT}
    `,
    params: where.params,
  }
}

export function blogLinkCountsQuery(userId: string, filter: BlogLinksFilter): { sql: string; params: unknown[] } {
  const where = blogLinksWhereSql(userId, filter, false)
  return {
    sql: `
      SELECT status, COUNT(*) AS count, SUM(is_pinned) AS pinned, SUM(is_favorite) AS favorite
      FROM blog_links${where.sql}
      GROUP BY status
    `,
    params: where.params,
  }
}

export function toBlogLinkCounts(rows: BlogLinkCountsRow[]): BlogLinkStats {
  const counts: BlogLinkStats = { total: 0, pending: 0, approved: 0, rejected: 0, pinned: 0, favorite: 0 }
  for (const row of rows) {
    const count = Number(row.count) || 0
    counts.total += count
    if (row.status === 'pending') counts.pending = count
    if (row.status === 'approved') counts.approved = count
    if (row.status === 'rejected') counts.rejected = count
    // One row per status, so these sums add each flagged link exactly once.
    counts.pinned += Number(row.pinned) || 0
    counts.favorite += Number(row.favorite) || 0
  }
  return counts
}
