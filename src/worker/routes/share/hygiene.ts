import { ShareExpiredLinks, ShareStaleLinks } from '@shared/types'
import { STALE_LINK_DEFAULT_DAYS } from '@shared/user-settings'
import { userSettingsNumberSql } from '../../lib/maintenance'
import { firstOf, rowsOf, type D1ReadResult } from './read-results'

const DAY_MS = 24 * 60 * 60 * 1000

/** How many quiet links the card lists; the count beside it covers all of them. */
const STALE_LINK_PAGE_SIZE = 5

/** How many lapsed links the notice lists; the count covers all of them. */
export const EXPIRED_LINK_PAGE_SIZE = 5

/**
 * The two hygiene reports the dashboard runs beside its analytics: the stale-links report (SH-70,
 * which links have gone quiet) and the expiry notice (audit #7, which links have lapsed since the
 * owner last dismissed it). They live together because both answer "what needs tending" from the
 * shares table alone, and neither is part of what the visit aggregates measure.
 */

export function composeStaleLinks(threshold: StaleThresholdRow | null, rows: StaleLinkRow[]): ShareStaleLinks {
  return {
    thresholdDays: threshold?.days ?? STALE_LINK_DEFAULT_DAYS,
    // The window function counts every match; LIMIT only decides how many are listed.
    total: rows[0]?.stale_total ?? 0,
    neverViewed: rows[0]?.never_viewed ?? 0,
    items: rows.map((row) => ({
      noteId: row.note_id,
      noteTitle: row.note_title,
      slug: row.slug,
      lastViewedAt: row.last_viewed_at,
      views: row.views,
    })),
  }
}

export function staleThresholdStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT ${staleThresholdSql()} AS days FROM users u WHERE u.id = ?1`,
  ).bind(userId)
}

export function staleLinksStatement(db: D1Database, params: { userId: string; now: number }): D1PreparedStatement {
  const threshold = staleThresholdSql()
  return db.prepare(
    `SELECT s.note_id, s.slug, s.last_viewed_at, s.views, n.title as note_title,
            COUNT(*) OVER () as stale_total,
            SUM(CASE WHEN s.last_viewed_at IS NULL THEN 1 ELSE 0 END) OVER () as never_viewed
       FROM shares s
       LEFT JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
       JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ?1
        AND (s.is_enabled = 1 OR s.is_enabled IS NULL)
        AND (s.expires_at IS NULL OR s.expires_at > ?2)
        AND ${threshold} > 0
        AND (s.last_viewed_at IS NULL OR s.last_viewed_at <= ?2 - ${threshold} * ?3)
      ORDER BY COALESCE(s.last_viewed_at, 0), s.created_at, s.note_id
      LIMIT ?4`,
  ).bind(params.userId, params.now, DAY_MS, STALE_LINK_PAGE_SIZE)
}

export function parseStaleThreshold(result: D1ReadResult): StaleThresholdRow | null {
  return firstOf<StaleThresholdRow>(result)
}

export function staleLinkRows(result: D1ReadResult): StaleLinkRow[] {
  return rowsOf<StaleLinkRow>(result)
}

/** The threshold expression both stale statements use, so they cannot disagree about it. */
function staleThresholdSql(): string {
  return userSettingsNumberSql('$.share.staleLinkDays', STALE_LINK_DEFAULT_DAYS)
}

export interface StaleThresholdRow {
  days: number
}

interface StaleLinkRow {
  note_id: string
  note_title: string | null
  slug: string
  last_viewed_at: number | null
  views: number
  stale_total: number
  never_viewed: number
}

/**
 * The expiry notice (audit #7): links that lapsed since the owner last dismissed the notice. The
 * dismissal is one timestamp, so "new since" is just `expires_at > acknowledgedAt` — a link that
 * expired again after being acknowledged comes back, and one acknowledged once stays gone.
 */
export function expiredLinksStatement(db: D1Database, params: { userId: string; now: number; acknowledgedAt?: number | null }): D1PreparedStatement {
  return db.prepare(
    `SELECT s.note_id, s.slug, s.expires_at, n.title as note_title,
            COUNT(*) OVER () as expired_total
       FROM shares s
       LEFT JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1
        AND s.expires_at IS NOT NULL AND s.expires_at < ?2
        AND (?3 IS NULL OR s.expires_at > ?3)
      ORDER BY s.expires_at DESC, s.slug
      LIMIT ?4`,
  ).bind(params.userId, params.now, params.acknowledgedAt ?? null, EXPIRED_LINK_PAGE_SIZE)
}

export function parseExpiredAck(raw: string | null): number | null {
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function composeExpiredLinks(acknowledgedAt: number | null, rows: ExpiredLinkRow[]): ShareExpiredLinks {
  return {
    acknowledgedAt,
    total: rows[0]?.expired_total ?? 0,
    items: rows.map((row) => ({
      noteId: row.note_id,
      noteTitle: row.note_title,
      slug: row.slug,
      expiresAt: row.expires_at,
    })),
  }
}

interface ExpiredLinkRow {
  note_id: string
  slug: string
  expires_at: number
  note_title: string | null
  expired_total: number
}
