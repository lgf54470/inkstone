import type { ShareTimelineRange } from '@shared/types'
import { bucketsFromVisitRows, timelineBucketCount, type TimelineBucket } from './share-analytics'

// Both visit tables answer the same questions (totals, timeline buckets, five
// distributions, per-target stats). A bounded range can be answered by grouping
// the fetched rows in JS, but `all` has no bound on the row count, so it must be
// answered by SQL aggregation. Both paths build the same normalized shape, which
// is what the dashboards actually consume.

export interface VisitAggregateSource {
  table: string
  targetColumn: string
  osFallback: string
}

export const SHARE_VISIT_SOURCE: VisitAggregateSource = {
  table: 'share_visits',
  targetColumn: 'note_id',
  osFallback: 'other',
}

export const BLOG_VISIT_SOURCE: VisitAggregateSource = {
  table: 'blog_visits',
  targetColumn: 'post_id',
  osFallback: 'Other',
}

export interface VisitScope {
  userId: string
  targetId?: string
}

export interface VisitAggregateQuery {
  range: ShareTimelineRange
  startTs: number
  duration: number
  clause: string
}

export interface VisitFactRow {
  visited_at: number
  visitor_fp: string | null
  country: string | null
  referrer_host: string | null
  device_type: string | null
  os: string | null
  browser: string | null
  target_id: string | null
  slug: string
}

export interface VisitTargetStat {
  views: number
  visitors: number
  slug: string
}

export interface VisitDistributionMaps {
  countries: Map<string, number>
  referrers: Map<string, number>
  devices: Map<string, number>
  osList: Map<string, number>
  browsers: Map<string, number>
}

export interface VisitAggregate extends VisitDistributionMaps {
  views: number
  visitors: number
  buckets: TimelineBucket[]
  targets: Map<string, VisitTargetStat>
}

export function aggregateFromRows(
  rows: VisitFactRow[],
  query: VisitAggregateQuery,
  source: VisitAggregateSource,
): VisitAggregate {
  const visitors = new Set<string>()
  const countries = new Map<string, number>()
  const referrers = new Map<string, number>()
  const devices = new Map<string, number>()
  const osList = new Map<string, number>()
  const browsers = new Map<string, number>()
  const targetRows = new Map<string, { views: number; uvs: Set<string>; slug: string }>()

  for (const row of rows) {
    if (row.visitor_fp) visitors.add(row.visitor_fp)
    bump(countries, (row.country || 'Unknown').toUpperCase())
    bump(referrers, row.referrer_host || 'Direct')
    bump(devices, row.device_type || 'desktop')
    bump(osList, row.os || source.osFallback)
    bump(browsers, row.browser || 'Other')
    if (row.target_id) {
      const entry = targetRows.get(row.target_id) ?? { views: 0, uvs: new Set<string>(), slug: '' }
      entry.views += 1
      if (row.visitor_fp) entry.uvs.add(row.visitor_fp)
      // Visits keep their stored slug after the target is renamed, so a target can
      // have several; MAX() is what the SQL path answers with, so this matches it.
      if (row.slug > entry.slug) entry.slug = row.slug
      targetRows.set(row.target_id, entry)
    }
  }

  const targets = new Map<string, VisitTargetStat>()
  for (const [targetId, entry] of targetRows) {
    targets.set(targetId, { views: entry.views, visitors: entry.uvs.size, slug: entry.slug })
  }

  return {
    views: rows.length,
    visitors: visitors.size,
    buckets: bucketsFromVisitRows(rows, query.range, query.startTs, query.duration),
    countries,
    referrers,
    devices,
    osList,
    browsers,
    targets,
  }
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) || 0) + 1)
}

export interface VisitWhere {
  sql: string
  binds: Array<string | number>
  startTsParam: number
}

/**
 * The scope and range every statement about one visit table shares. Exported so a statement a
 * single dashboard needs on top of the common set (the share-only channel split) filters exactly
 * the same rows the aggregate beside it does, instead of re-deriving the predicate.
 */
export function visitWhere(source: VisitAggregateSource, scope: VisitScope, query: VisitAggregateQuery): VisitWhere {
  const binds: Array<string | number> = []
  const conditions: string[] = []
  if (scope.targetId) {
    binds.push(scope.targetId)
    conditions.push(`${source.targetColumn} = ?${binds.length}`)
  }
  binds.push(scope.userId)
  conditions.push(`user_id = ?${binds.length}`)
  binds.push(query.startTs)
  conditions.push(`visited_at >= ?${binds.length}`)
  return { sql: `${conditions.join(' AND ')} ${query.clause}`, binds, startTsParam: binds.length }
}

// One statement for a bounded range (the rows themselves), eight for `all`
// (totals, buckets, five distributions, per-target). `visitAggregateFromResults`
// unpacks them back in the same order.
export function visitAggregateStatements(
  db: D1Database,
  source: VisitAggregateSource,
  scope: VisitScope,
  query: VisitAggregateQuery,
): D1PreparedStatement[] {
  const where = visitWhere(source, scope, query)
  const rows = `
    SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
           ${source.targetColumn} AS target_id, slug
      FROM ${source.table}
     WHERE ${where.sql}`
  if (query.range !== 'all') {
    return [db.prepare(rows).bind(...where.binds)]
  }
  const bucketWidth = query.duration / timelineBucketCount(query.range)
  return [
    db.prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT NULLIF(visitor_fp, '')) AS visitors
         FROM ${source.table} WHERE ${where.sql}`,
    ).bind(...where.binds),
    db.prepare(
      `SELECT CAST((visited_at - ?${where.startTsParam}) / ?${where.startTsParam + 1} AS INTEGER) AS bucket,
              COUNT(*) AS views, COUNT(DISTINCT NULLIF(visitor_fp, '')) AS visitors
         FROM ${source.table}
        WHERE ${where.sql} AND visited_at < ?${where.startTsParam + 2}
        GROUP BY bucket`,
    ).bind(...where.binds, bucketWidth, query.startTs + query.duration),
    ...distributionStatements(db, source, where),
    db.prepare(
      `SELECT ${source.targetColumn} AS target_id, COUNT(*) AS views,
              COUNT(DISTINCT NULLIF(visitor_fp, '')) AS visitors, MAX(slug) AS slug
         FROM ${source.table}
        WHERE ${where.sql} AND ${source.targetColumn} IS NOT NULL
        GROUP BY ${source.targetColumn}`,
    ).bind(...where.binds),
  ]
}

// The OS bucket falls back to a per-source label, so that one statement binds an
// extra parameter the others do not.
function distributionStatements(
  db: D1Database,
  source: VisitAggregateSource,
  where: VisitWhere,
): D1PreparedStatement[] {
  const dimension = (expression: string): string =>
    `SELECT ${expression} AS name, COUNT(*) AS count FROM ${source.table} WHERE ${where.sql} GROUP BY name`
  return [
    // The fallback has to be uppercased too: the client matches the country
    // bucket on 'UNKNOWN' to show its "unknown country" label.
    db.prepare(dimension(`COALESCE(NULLIF(UPPER(country), ''), 'UNKNOWN')`)).bind(...where.binds),
    db.prepare(dimension(`COALESCE(NULLIF(referrer_host, ''), 'Direct')`)).bind(...where.binds),
    db.prepare(dimension(`COALESCE(NULLIF(device_type, ''), 'desktop')`)).bind(...where.binds),
    db.prepare(dimension(`COALESCE(NULLIF(os, ''), ?${where.startTsParam + 1})`)).bind(...where.binds, source.osFallback),
    db.prepare(dimension(`COALESCE(NULLIF(browser, ''), 'Other')`)).bind(...where.binds),
  ]
}

interface D1Rows {
  results?: unknown[]
}

export interface VisitTotalsSqlRow {
  views: number
  visitors: number
}

export interface VisitBucketSqlRow {
  bucket: number
  views: number
  visitors: number
}

export interface VisitNameCountSqlRow {
  name: string
  count: number
}

export interface VisitTargetSqlRow {
  target_id: string
  views: number
  visitors: number
  slug: string
}

export function visitAggregateFromResults(
  results: D1Rows[],
  query: VisitAggregateQuery,
  source: VisitAggregateSource,
): VisitAggregate {
  if (query.range !== 'all') {
    return aggregateFromRows((results[0]?.results ?? []) as VisitFactRow[], query, source)
  }
  const buckets: TimelineBucket[] = Array.from({ length: timelineBucketCount(query.range) }, () => ({ views: 0, visitors: 0 }))
  for (const row of sqlRows<VisitBucketSqlRow>(results[1])) {
    const bucket = buckets[row.bucket]
    if (bucket) {
      bucket.views = row.views
      bucket.visitors = row.visitors
    }
  }
  const targets = new Map<string, VisitTargetStat>()
  for (const row of sqlRows<VisitTargetSqlRow>(results[7])) {
    targets.set(row.target_id, { views: row.views, visitors: row.visitors, slug: row.slug })
  }
  const totals = sqlRows<VisitTotalsSqlRow>(results[0])[0]
  return {
    views: totals?.views ?? 0,
    visitors: totals?.visitors ?? 0,
    buckets,
    countries: countsByName(sqlRows<VisitNameCountSqlRow>(results[2])),
    referrers: countsByName(sqlRows<VisitNameCountSqlRow>(results[3])),
    devices: countsByName(sqlRows<VisitNameCountSqlRow>(results[4])),
    osList: countsByName(sqlRows<VisitNameCountSqlRow>(results[5])),
    browsers: countsByName(sqlRows<VisitNameCountSqlRow>(results[6])),
    targets,
  }
}

function sqlRows<Row>(result: D1Rows | undefined): Row[] {
  return (result?.results ?? []) as Row[]
}

function countsByName(rows: VisitNameCountSqlRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.name, row.count)
  }
  return map
}
