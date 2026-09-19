import { SHARE_VISIT_RETENTION_DEFAULT_DAYS } from '@shared/user-settings'

const LOGIN_ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Per-account visit log retention in days, read from the stored settings
 * document: 0 keeps every row, while a missing or unparsable value falls back
 * to the shipped default so an account that never opened the settings modal
 * still has a bounded log. `json_valid` guards a corrupt document, which would
 * otherwise make `json_extract` throw and take the whole sweep down.
 */
const VISIT_LOG_RETENTION_DAYS_SQL = `COALESCE(
  CASE WHEN json_valid(u.settings)
    THEN CAST(json_extract(u.settings, '$.share.visitLogRetentionDays') AS INTEGER)
  END, ${SHARE_VISIT_RETENTION_DEFAULT_DAYS})`


interface OperationalPurgeResult {
  sessions: number
  shareAssetSessions: number
  totpLoginChallenges: number
  loginAttempts: number
  orphanShareVisits: number
  shareVisitLogs: number
  orphanBlogVisits: number
}

export async function purgeExpiredOperationalData(
  db: D1Database,
  now = Date.now(),
  limit = 500,
): Promise<OperationalPurgeResult> {
  const capped = Math.max(1, Math.min(1_000, Math.trunc(limit)))
  // Order matters: the destructuring below lines up with these statements.
  const [sessions, shareAssetSessions, totpLoginChallenges, loginAttempts, orphanShareVisits, shareVisitLogs, orphanBlogVisits] =
    await db.batch([...tokenSweeps(db, now, capped), ...visitLogSweeps(db, now, capped)])
  return {
    sessions: sessions.meta.changes ?? 0,
    shareAssetSessions: shareAssetSessions.meta.changes ?? 0,
    totpLoginChallenges: totpLoginChallenges.meta.changes ?? 0,
    loginAttempts: loginAttempts.meta.changes ?? 0,
    orphanShareVisits: orphanShareVisits.meta.changes ?? 0,
    shareVisitLogs: shareVisitLogs.meta.changes ?? 0,
    orphanBlogVisits: orphanBlogVisits.meta.changes ?? 0,
  }
}

/** Bounded deletes for rows that carry their own expiry, plus stale login attempts. */
function tokenSweeps(db: D1Database, now: number, capped: number): D1PreparedStatement[] {
  return [
    db.prepare(
      `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions WHERE expires_at <= ?1 ORDER BY expires_at, id LIMIT ?2
       )`,
    ).bind(now, capped),
    db.prepare(
      `DELETE FROM share_asset_sessions WHERE id IN (
         SELECT id FROM share_asset_sessions WHERE expires_at <= ?1 ORDER BY expires_at, id LIMIT ?2
       )`,
    ).bind(now, capped),
    db.prepare(
      `DELETE FROM totp_login_challenges WHERE id IN (
         SELECT id FROM totp_login_challenges
          WHERE expires_at <= ?1 ORDER BY expires_at, id LIMIT ?2
       )`,
    ).bind(now, capped),
    db.prepare(
      `DELETE FROM login_attempts WHERE key IN (
         SELECT key FROM login_attempts WHERE last_fail_at < ?1 ORDER BY last_fail_at, key LIMIT ?2
       )`,
    ).bind(now - LOGIN_ATTEMPT_RETENTION_MS, capped),
  ]
}

/** Visit log rows are the only purge without an expiry column: they go by ownership and age. */
function visitLogSweeps(db: D1Database, now: number, capped: number): D1PreparedStatement[] {
  return [
    // Sweeps rows orphaned before the revoke/purge cascades existed (and by the MCP revoke tool).
    db.prepare(
      `DELETE FROM share_visits WHERE id IN (
         SELECT sv.id FROM share_visits sv
          WHERE NOT EXISTS (SELECT 1 FROM shares s WHERE s.slug = sv.slug)
          ORDER BY sv.visited_at, sv.id LIMIT ?1
       )`,
    ).bind(capped),
    db.prepare(
      `DELETE FROM share_visits WHERE id IN (
         SELECT sv.id FROM share_visits sv
           LEFT JOIN users u ON u.id = sv.user_id
          WHERE ${VISIT_LOG_RETENTION_DAYS_SQL} > 0
            AND sv.visited_at < ?1 - ${VISIT_LOG_RETENTION_DAYS_SQL} * ?2
          ORDER BY sv.visited_at, sv.id LIMIT ?3
       )`,
    ).bind(now, DAY_MS, capped),
    // Blog visits have no retention setting yet, so only rows whose post is gone are swept here.
    db.prepare(
      `DELETE FROM blog_visits WHERE id IN (
         SELECT bv.id FROM blog_visits bv
          WHERE NOT EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = bv.post_id)
          ORDER BY bv.visited_at, bv.id LIMIT ?1
       )`,
    ).bind(capped),
  ]
}
