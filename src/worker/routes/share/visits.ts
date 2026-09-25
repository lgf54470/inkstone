import { Hono } from 'hono'
import { ShareVisitLog } from '@shared/types'
import type { ShareTimelineRange } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { escapeLike } from '../../lib/like'
import { JSON_BODY_LIMITS, clampInt, readOptionalJsonValidated } from '../../lib/request'
import { requireCurrentPassword } from '../../lib/reauth'
import { getRangeStartTimestamp, parseBotName, publicVisitorFingerprint } from '../../lib/share-analytics'
import { isVisitLogFilter, type VisitLogFilter } from '@shared/share-selection'
import { visitLogFilterSql } from '../../lib/share-selection-sql'
import { consumeShareReadBudget } from './read-budget'
import { shareVisitWipeSchema } from './schemas'

/** An unknown log filter is refused, for the same reason an unknown status is: silently answering
 * with every row looks like a filter that matched everything. */
function visitLogFilterParam(raw: string | undefined): VisitLogFilter {
  if (!raw) return 'all'
  if (!isVisitLogFilter(raw)) throw ApiError.badRequest(`Unknown visit filter: ${raw}`)
  return raw
}

const VISIT_LOG_RANGES: readonly string[] = ['24h', '7d', '30d', 'all']

/**
 * The window the log lists, in the same vocabulary the analytics panels speak. Unlike the analytics
 * route — which sanitizes an unknown range to 30d — the log refuses one: a dropped or mistyped range
 * that quietly became "the last 30 days" would read as "everything" on a surface whose empty state
 * says nothing matched. Absent means all, which is what every caller before the control existed sent.
 */
function visitLogRangeParam(raw: string | undefined): ShareTimelineRange {
  if (!raw) return 'all'
  if (!VISIT_LOG_RANGES.includes(raw)) throw ApiError.badRequest(`Unknown visit log range: ${raw}`)
  return raw as ShareTimelineRange
}

interface VisitLogRow {
  id: number
  note_id: string
  slug: string
  visited_at: number
  country: string | null
  region: string | null
  city: string | null
  referrer: string | null
  referrer_host: string | null
  device_type: string | null
  os: string | null
  browser: string | null
  user_agent: string | null
  visitor_fp: string | null
  is_bot: number
  is_self_referrer: number
  is_owner: number
  note_title: string | null
  channel: string | null
}

// Unparseable page/limit values must fall back to a default rather than reach the
// binding: `parseInt('abc')` is NaN and `Math.max(1, NaN)` stays NaN, which SQLite
// rejects as a datatype mismatch (a 500 for a malformed query). The ceiling on
// `page` is what keeps a caller from asking for an unbounded OFFSET: at the largest
// page size this still reaches every page a 100-per-page walk can ask for, while
// capping the worst OFFSET at five figures instead of nine.
const VISITS_PAGE_DEFAULT = 1
const VISITS_PAGE_MAX = 10_000
const VISITS_LIMIT_MIN = 10
const VISITS_LIMIT_MAX = 100
const VISITS_LIMIT_DEFAULT = 50
const CLEANUP_DAYS_DEFAULT = 30
const CLEANUP_DAYS_PATTERN = /^\d+$/

export function registerShareVisitsRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareVisitsListRoute(shareManageRoutes)
  registerShareVisitsClearRoute(shareManageRoutes)
}

function registerShareVisitsListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/visits', async (c) => {
    const userId = c.get('userId')
    await consumeShareReadBudget(c.env.DB, userId)
    const page = clampInt(c.req.query('page'), VISITS_PAGE_DEFAULT, VISITS_PAGE_MAX, VISITS_PAGE_DEFAULT)
    const limit = clampInt(c.req.query('limit'), VISITS_LIMIT_MIN, VISITS_LIMIT_MAX, VISITS_LIMIT_DEFAULT)
    const offset = (page - 1) * limit
    const now = Date.now()
    const range = visitLogRangeParam(c.req.query('range'))
    const { conditions, binds, bindIdx } = visitLogFilter({
      noteId: c.req.query('noteId'),
      filter: visitLogFilterParam(c.req.query('filter')),
      search: (c.req.query('search') || '').trim(),
      userId,
      since: getRangeStartTimestamp(range, now),
    })
    conditions.push('EXISTS (SELECT 1 FROM shares s WHERE s.slug = sv.slug)')

    // One round trip for the count and the page: the two statements share the same filter, and
    // paying a second sequential flight for it doubled the tail latency of every page view.
    const [countResult, rowsResult] = await c.env.DB.batch<VisitLogRow | { total: number }>(
      visitLogPageStatements(c.env.DB, { conditions, binds, bindIdx, limit, offset }),
    )
    const total = (countResult.results[0] as { total: number } | undefined)?.total ?? 0
    const visits: ShareVisitLog[] = ((rowsResult.results ?? []) as VisitLogRow[]).map(toVisitLogRow)

    return c.json({
      visits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  })
}

function visitLogPageStatements(db: D1Database, params: {
  conditions: string[]
  binds: Array<string | number>
  bindIdx: number
  limit: number
  offset: number
}): [D1PreparedStatement, D1PreparedStatement] {
  const { conditions, binds, bindIdx, limit, offset } = params
  const where = conditions.join(' AND ')
  return [
    db.prepare(
      `SELECT COUNT(*) as total
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE ${where}`,
    ).bind(...binds),
    db.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser,
              CASE WHEN sv.is_bot = 1 THEN sv.user_agent END as user_agent,
              sv.visitor_fp, sv.is_bot, sv.is_self_referrer, sv.is_owner, sv.channel,
              n.title as note_title
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE ${where}
        ORDER BY sv.visited_at DESC
        LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`,
    ).bind(...binds, limit, offset),
  ]
}

function registerShareVisitsClearRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.delete('/visits', async (c) => {
    const userId = c.get('userId')
    const type = c.req.query('type') || 'all'
    const days = cleanupDays(c.req.query('days'), type)
    const noteId = scopedNoteId(c.req.query('noteId'), type)
    if (type === 'all' || noteId) {
      // Wiping the whole audit trail — or one link's whole history, which is just as
      // unrecoverable — means a stolen session must re-prove it holds the account password.
      const body = await readOptionalJsonValidated(c, shareVisitWipeSchema, JSON_BODY_LIMITS.small, {})
      await requireCurrentPassword(c.env.DB, userId, body.password ?? '')
    }
    const res = await deleteVisitLogs(c.env.DB, userId, type, days, noteId)
    return c.json({ ok: true as const, deleted: res.meta.changes ?? 0 })
  })
}

/**
 * The note a delete is scoped to, when one was asked for. An empty value is the dangerous
 * case: it is present but names nothing, and letting it through would fall back to the
 * account-wide delete — the widest possible reading of a request that asked for the
 * narrowest. Only `type=all` can be scoped this way; pairing a note with a filtered type
 * would delete something other than what the caller described, so it is rejected too.
 */
function scopedNoteId(raw: string | undefined, type: string): string | null {
  if (raw === undefined) return null
  const noteId = raw.trim()
  if (!noteId) throw ApiError.badRequest('Clearing one link’s visit log requires the note id it belongs to')
  if (type !== 'all') throw ApiError.badRequest('A note-scoped visit cleanup only supports type=all')
  return noteId
}

/**
 * `older_than` must be given an explicit positive day count: silently falling back
 * to a default would delete a window the caller never asked for, so an unparseable
 * or non-positive value is a 400. The other cleanup types never read it.
 */
function cleanupDays(raw: string | undefined, type: string): number {
  if (type !== 'older_than') return CLEANUP_DAYS_DEFAULT
  const value = (raw ?? '').trim()
  const days = Number(value)
  if (!CLEANUP_DAYS_PATTERN.test(value) || !Number.isSafeInteger(days) || days < 1) {
    throw ApiError.badRequest('Cleaning logs older than N days requires a positive integer for days')
  }
  return days
}

function visitLogFilter(params: {
  userId: string
  noteId: string | undefined
  filter: VisitLogFilter
  search: string
  /** The window's lower bound; 0 (the `all` range) adds no condition and no bind. */
  since: number
}): { conditions: string[]; binds: Array<string | number>; bindIdx: number } {
  const { userId, noteId, filter, search, since } = params
  const conditions = [`sv.user_id = ?1`]
  const binds: Array<string | number> = [userId]
  let bindIdx = 2
  if (noteId) {
    conditions.push(`sv.note_id = ?${bindIdx}`)
    binds.push(noteId)
    bindIdx++
  }
  if (since > 0) {
    conditions.push(`sv.visited_at >= ?${bindIdx}`)
    binds.push(since)
    bindIdx++
  }
  const filterCondition = visitLogFilterSql(filter, 'sv')
  if (filterCondition) conditions.push(filterCondition)
  if (search) {
    conditions.push(`(n.title LIKE ?${bindIdx} ESCAPE '\\' OR sv.slug LIKE ?${bindIdx} ESCAPE '\\' OR sv.country LIKE ?${bindIdx} ESCAPE '\\' OR sv.referrer_host LIKE ?${bindIdx} ESCAPE '\\')`)
    binds.push(`%${escapeLike(search)}%`)
    bindIdx++
  }
  return { conditions, binds, bindIdx }
}

async function deleteVisitLogs(
  db: D1Database,
  userId: string,
  type: string,
  days: number,
  noteId: string | null,
): Promise<{ meta: { changes: number } }> {
  if (noteId) {
    return db.prepare(`DELETE FROM share_visits WHERE user_id = ?1 AND note_id = ?2`).bind(userId, noteId).run()
  }
  if (type === 'bots') {
    return db.prepare(`DELETE FROM share_visits WHERE user_id = ?1 AND is_bot = 1`).bind(userId).run()
  }
  if (type === 'older_than') {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    return db.prepare(`DELETE FROM share_visits WHERE user_id = ?1 AND visited_at < ?2`).bind(userId, cutoff).run()
  }
  if (type === 'all') {
    return db.prepare(`DELETE FROM share_visits WHERE user_id = ?1`).bind(userId).run()
  }
  return { meta: { changes: 0 } }
}

function toVisitLogRow(r: VisitLogRow): ShareVisitLog {
  return {
    id: r.id,
    noteId: r.note_id,
    noteTitle: r.note_title,
    slug: r.slug,
    visitedAt: r.visited_at,
    country: r.country,
    region: r.region,
    city: r.city,
    referrer: r.referrer,
    referrerHost: r.referrer_host,
    deviceType: r.device_type,
    os: r.os,
    browser: r.browser,
    visitorFp: r.visitor_fp ? publicVisitorFingerprint(r.visitor_fp) : null,
    isBot: r.is_bot === 1,
    isSelfReferrer: r.is_self_referrer === 1,
    isOwner: r.is_owner === 1,
    botName: r.is_bot === 1 ? parseBotName(r.user_agent || '') : null,
    // Empty string is the stored "a marker was sent and refused": the log shows the marker, and
    // the split between the two kinds of miss belongs to the channel card, not to a row.
    channel: r.channel || null,
  }
}
