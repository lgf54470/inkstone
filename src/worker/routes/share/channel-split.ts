import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED } from '@shared/share-channel'
import type { ShareBreakdownItem } from '@shared/types'
import { toBreakdown } from '../../lib/share-analytics'
import { SHARE_VISIT_SOURCE, visitWhere, type VisitAggregateQuery, type VisitScope } from '../../lib/visit-aggregates'

/**
 * Which copy of a link each visit came from (ADR-0004), for the same rows the visit aggregate
 * beside it summarizes.
 *
 * It lives here rather than in `visit-aggregates` because only the share table has a marker
 * column, and both dashboards read that module's statement list positionally.
 *
 * A visit with no marker and a visit whose marker was refused are counted in separate rows and
 * never merged: a marker that quietly stopped matching has to be visible, not averaged into
 * "direct". The two reserved names cannot collide with a stored token, which always starts with a
 * letter or digit (see `share-channel`).
 */
export interface ChannelCountRow {
  name: string
  count: number
}

export function channelBreakdownStatement(
  db: D1Database,
  scope: VisitScope,
  query: VisitAggregateQuery,
): D1PreparedStatement {
  const where = visitWhere(SHARE_VISIT_SOURCE, scope, query)
  return db.prepare(
    `SELECT CASE
              WHEN channel IS NULL THEN '${CHANNEL_UNMARKED}'
              WHEN channel = '' THEN '${CHANNEL_UNRECOGNIZED}'
              ELSE channel
            END AS name,
            COUNT(*) AS count
       FROM share_visits
      WHERE ${where.sql}
      GROUP BY name`,
  ).bind(...where.binds)
}

/**
 * Percentages share the dashboard's denominator, so the split sums against the KPI row. `labels`
 * (from `collectionChannelLabels`) turns a directory's marker into the collection that sent the
 * visit; a marker with no entry stays exactly as the owner wrote it.
 */
export function composeChannels(
  rows: ChannelCountRow[],
  total: number,
  labels: Map<string, string> = new Map(),
): ShareBreakdownItem[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.name, row.count)
  return toBreakdown(counts, total).map((item) => {
    const label = labels.get(item.name)
    return label ? { ...item, label } : item
  })
}
