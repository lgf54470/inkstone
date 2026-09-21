import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { clampInt } from '../../lib/request'
import { foldSessionRows, nextSessionCursor, sessionsStatement, decodeSessionCursor, type SessionRow } from '../../lib/share-sessions'
import { analyticsContext } from './analytics'
import { consumeShareReadBudget } from './read-budget'
import { rowsOf } from './read-results'

/** One page of sessions; the ceiling keeps a single request from walking a whole account. */
const SESSIONS_LIMIT_DEFAULT = 25
const SESSIONS_LIMIT_MAX = 100

/**
 * The visitor session view (ADR-0003). Read-only, owner-only, and derived on every request: the
 * response carries the same window and the same traffic filters as the dashboard's log panel.
 */
export function registerShareSessionRoutes(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/sessions', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const ctx = await analyticsContext(db, c, { userId })
    // Only the unbounded range is charged, the same rule the analytics routes use: a bounded range
    // reads one window of rows, while `all` derives sessions over the account's whole history.
    if (ctx.range === 'all') await consumeShareReadBudget(db, userId)
    const limit = clampInt(c.req.query('limit'), 1, SESSIONS_LIMIT_MAX, SESSIONS_LIMIT_DEFAULT)
    const cursor = sessionCursor(c.req.query('cursor'))
    const result = await sessionsStatement(db, {
      userId,
      startTs: ctx.startTs,
      clause: ctx.clause,
      cursor,
      limit,
    }).all<SessionRow>()
    const rows = rowsOf<SessionRow>(result)
    const sessions = foldSessionRows(rows)
    return c.json({
      sessions,
      nextCursor: nextSessionCursor(rows, sessions, limit),
      limit,
    })
  })
}

/**
 * A cursor this worker did not mint is a client bug: answering the first page instead would silently
 * restart the walk, so it is a 400 — the same reading the rest of the module gives a malformed
 * parameter it cannot honour.
 */
function sessionCursor(raw: string | undefined) {
  try {
    return decodeSessionCursor(raw)
  } catch {
    throw ApiError.badRequest('The session cursor is not valid')
  }
}
