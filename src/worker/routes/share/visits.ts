import { Hono } from 'hono'
import { ShareVisitLog } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { escapeLike } from '../../lib/like'
import { JSON_BODY_LIMITS, clampInt, readOptionalJsonValidated } from '../../lib/request'
import { requireCurrentPassword } from '../../lib/reauth'
import { parseBotName } from '../../lib/share-analytics'
import { shareVisitWipeSchema } from './schemas'

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
}

// Unparseable page/limit values must fall back to a default rather than reach the
// binding: `parseInt('abc')` is NaN and `Math.max(1, NaN)` stays NaN, which SQLite
// rejects as a datatype mismatch (a 500 for a malformed query). The ceiling on
// `page` is what keeps a caller from asking for an unbounded OFFSET.
const VISITS_PAGE_DEFAULT = 1
const VISITS_PAGE_MAX = 1_000_000
const VISITS_LIMIT_MIN = 10
const VISITS_LIMIT_MAX = 100
const VISITS_LIMIT_DEFAULT = 50
const CLEANUP_DAYS_DEFAULT = 30
const CLEANUP_DAYS_PATTERN = /^\d+$/

// The log table labels a visitor by the head of its fingerprint and nothing more;
// the stored digest is a pseudonymous identifier, so only this much of it is ever
// allowed to leave the worker.
const VISITOR_FP_DISPLAY_CHARS = 8

export function registerShareVisitsRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareVisitsListRoute(shareManageRoutes)
  registerShareVisitsClearRoute(shareManageRoutes)
}

function registerShareVisitsListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/visits', async (c) => {
    const userId = c.get('userId')
    const page = clampInt(c.req.query('page'), VISITS_PAGE_DEFAULT, VISITS_PAGE_MAX, VISITS_PAGE_DEFAULT)
    const limit = clampInt(c.req.query('limit'), VISITS_LIMIT_MIN, VISITS_LIMIT_MAX, VISITS_LIMIT_DEFAULT)
    const offset = (page - 1) * limit
    const { conditions, binds, bindIdx } = visitLogFilter({
      noteId: c.req.query('noteId'),
      filter: c.req.query('filter') || 'all',
      search: (c.req.query('search') || '').trim(),
      userId,
    })
    conditions.push('EXISTS (SELECT 1 FROM shares s WHERE s.slug = sv.slug)')

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE ${conditions.join(' AND ')}`,
    ).bind(...binds).first<{ total: number }>()
    const total = countRow?.total ?? 0

    const rows = await c.env.DB.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser,
              CASE WHEN sv.is_bot = 1 THEN sv.user_agent END as user_agent,
              sv.visitor_fp, sv.is_bot, sv.is_self_referrer, sv.is_owner,
              n.title as note_title
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY sv.visited_at DESC
        LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`,
    ).bind(...binds, limit, offset).all<VisitLogRow>()
    const visits: ShareVisitLog[] = (rows.results ?? []).map(toVisitLogRow)

    return c.json({
      visits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  })
}

function registerShareVisitsClearRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.delete('/visits', async (c) => {
    const userId = c.get('userId')
    const type = c.req.query('type') || 'all'
    const days = cleanupDays(c.req.query('days'), type)
    if (type === 'all') {
      // Wiping the whole audit trail is unrecoverable, so a stolen session must
      // re-prove it holds the account password before the delete runs.
      const body = await readOptionalJsonValidated(c, shareVisitWipeSchema, JSON_BODY_LIMITS.small, {})
      await requireCurrentPassword(c.env.DB, userId, body.password ?? '')
    }
    const res = await deleteVisitLogs(c.env.DB, userId, type, days)
    return c.json({ ok: true as const, deleted: res.meta.changes ?? 0 })
  })
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

const VISIT_FILTER_CONDITIONS: Record<string, string> = {
  real: `sv.is_bot = 0 AND sv.is_self_referrer = 0 AND sv.is_owner = 0`,
  bot: `sv.is_bot = 1`,
  owner: `sv.is_owner = 1`,
  self: `sv.is_self_referrer = 1`,
}

function visitLogFilter(params: {
  userId: string
  noteId: string | undefined
  filter: string
  search: string
}): { conditions: string[]; binds: Array<string | number>; bindIdx: number } {
  const { userId, noteId, filter, search } = params
  const conditions = [`sv.user_id = ?1`]
  const binds: Array<string | number> = [userId]
  let bindIdx = 2
  if (noteId) {
    conditions.push(`sv.note_id = ?${bindIdx}`)
    binds.push(noteId)
    bindIdx++
  }
  const filterCondition = VISIT_FILTER_CONDITIONS[filter]
  if (filterCondition) conditions.push(filterCondition)
  if (search) {
    conditions.push(`(n.title LIKE ?${bindIdx} ESCAPE '\\' OR sv.slug LIKE ?${bindIdx} ESCAPE '\\' OR sv.country LIKE ?${bindIdx} ESCAPE '\\' OR sv.referrer_host LIKE ?${bindIdx} ESCAPE '\\')`)
    binds.push(`%${escapeLike(search)}%`)
    bindIdx++
  }
  return { conditions, binds, bindIdx }
}

async function deleteVisitLogs(db: D1Database, userId: string, type: string, days: number): Promise<{ meta: { changes: number } }> {
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
    visitorFp: r.visitor_fp ? r.visitor_fp.slice(0, VISITOR_FP_DISPLAY_CHARS) : null,
    isBot: r.is_bot === 1,
    isSelfReferrer: r.is_self_referrer === 1,
    isOwner: r.is_owner === 1,
    botName: r.is_bot === 1 ? parseBotName(r.user_agent || '') : null,
  }
}
