import { Hono } from "hono";
import { ShareVisitLog } from "@shared/types";
import type { AppBindings } from "../../env";
import { parseBotName } from "../../lib/share-analytics";

export function registerShareVisitsRoutes(shareManageRoutes: Hono<AppBindings>): void {
shareManageRoutes.get('/visits', async (c) => {
  const userId = c.get('userId')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(c.req.query('limit') || '50', 10)))
  const offset = (page - 1) * limit
  const noteId = c.req.query('noteId')
  const filter = c.req.query('filter') || 'all'
  const search = (c.req.query('search') || '').trim()

  const conditions = [`sv.user_id = ?1`]
  const binds: Array<string | number> = [userId]
  let bindIdx = 2

  if (noteId) {
    conditions.push(`sv.note_id = ?${bindIdx}`)
    binds.push(noteId)
    bindIdx++
  }

  if (filter === 'real') {
    conditions.push(`sv.is_bot = 0 AND sv.is_self_referrer = 0 AND sv.is_owner = 0`)
  } else if (filter === 'bot') {
    conditions.push(`sv.is_bot = 1`)
  } else if (filter === 'owner') {
    conditions.push(`sv.is_owner = 1`)
  } else if (filter === 'self') {
    conditions.push(`sv.is_self_referrer = 1`)
  }

  if (search) {
    conditions.push(`(n.title LIKE ?${bindIdx} OR sv.slug LIKE ?${bindIdx} OR sv.country LIKE ?${bindIdx} OR sv.referrer_host LIKE ?${bindIdx})`)
    binds.push(`%${search}%`)
    bindIdx++
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total
       FROM share_visits sv
       LEFT JOIN notes n ON n.id = sv.note_id
      WHERE ${conditions.join(' AND ')}`,
  ).bind(...binds).first<{ total: number }>()

  const total = countRow?.total ?? 0

  const rows = await c.env.DB.prepare(
    `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
            sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
            sv.visitor_fp, sv.is_bot, sv.is_self_referrer, sv.is_owner,
            COALESCE(n.title, 'Untitled note') as note_title
       FROM share_visits sv
       LEFT JOIN notes n ON n.id = sv.note_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sv.visited_at DESC
      LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`,
  ).bind(...binds, limit, offset).all<{
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
    note_title: string
  }>()

  const visits: ShareVisitLog[] = (rows.results ?? []).map((r) => ({
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
    visitorFp: r.visitor_fp,
    isBot: r.is_bot === 1,
    isSelfReferrer: r.is_self_referrer === 1,
    isOwner: r.is_owner === 1,
    botName: r.is_bot === 1 ? parseBotName(r.user_agent || '') : null,
  }))

  return c.json({
    visits,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

shareManageRoutes.delete('/visits', async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type') || 'all'
  const days = parseInt(c.req.query('days') || '30', 10)

  let deleted = 0
  if (type === 'bots') {
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1 AND is_bot = 1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'older_than') {
    const cutoff = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1 AND visited_at < ?2`,
    ).bind(userId, cutoff).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'all') {
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  }

  return c.json({ ok: true as const, deleted })
})
}

