import { SESSION_TTL_MS } from '@shared/constants';
import type { Env } from '../../env';
import { decryptTotpSecret } from '../crypto';
import { ApiError } from '../errors';
import { newId } from '../id';
import { hashToken, newSessionToken } from '../session-store';
import { hashOpaqueToken, hashRecoveryCode, isOpaqueToken, matchTotpCode, normalizeRecoveryCode } from '../totp';
import { assertFactorUnlocked } from './factor';
import { changed } from './factor';
import { clearFactorAttempts } from './factor';
import { consumeWorkBudget } from './factor';
import { countRecoveryCodes } from './factor';
import { factorThrottle } from './factor';
import { factorUnavailable } from './factor';
import { rejectFactor } from './factor';
import type { TotpLoginRow } from './factor';

export interface CompletedTotpLogin {
  userId: string
  sessionToken: string
  recoveryCodeUsed: boolean
  recoveryCodesRemaining: number | null
}

async function loginChallengeRow(
  db: D1Database,
  challengeHash: string,
  now: number,
): Promise<TotpLoginRow | null> {
  const row = await db.prepare(
    `SELECT ch.user_id, ch.expires_at,
            c.secret_ciphertext, c.recovery_generation, c.last_used_step
       FROM totp_login_challenges ch
       JOIN totp_credentials c ON c.user_id = ch.user_id
      WHERE ch.id = ?1 AND c.enabled_at IS NOT NULL`,
  ).bind(challengeHash).first<TotpLoginRow>()
  if (!row) {
    await db.prepare(`DELETE FROM totp_login_challenges WHERE id = ?1`)
      .bind(challengeHash).run()
    return null
  }
  if (row.expires_at <= now) {
    await db.prepare(`DELETE FROM totp_login_challenges WHERE id = ?1`)
      .bind(challengeHash).run()
    return null
  }
  return row
}

async function claimByRecoveryCode(input: {
  env: Env
  row: TotpLoginRow
  recoveryCode: string
  operationId: string
  challengeHash: string
  sessionHash: string
  expiresAt: number
  now: number
}): Promise<D1Result[]> {
  const codeHash = await hashRecoveryCode(input.row.user_id, input.recoveryCode)
  return input.env.DB.batch([
    input.env.DB.prepare(
      `UPDATE totp_recovery_codes SET used_at = ?1, used_by = ?2
        WHERE user_id = ?3
          AND code_hash = ?4
          AND generation = ?5
          AND used_at IS NULL
          AND EXISTS (
            SELECT 1 FROM totp_login_challenges
             WHERE id = ?6 AND user_id = ?3 AND expires_at > ?1 AND claimed_by IS NULL
          )`,
    ).bind(input.now, input.operationId, input.row.user_id, codeHash, input.row.recovery_generation, input.challengeHash),
    input.env.DB.prepare(
      `UPDATE totp_login_challenges SET claimed_by = ?1
        WHERE id = ?2 AND user_id = ?3 AND expires_at > ?4 AND claimed_by IS NULL
          AND EXISTS (
            SELECT 1 FROM totp_recovery_codes
             WHERE user_id = ?3 AND code_hash = ?5 AND used_by = ?1
          )`,
    ).bind(input.operationId, input.challengeHash, input.row.user_id, input.now, codeHash),
    input.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (
          SELECT 1 FROM totp_recovery_codes
           WHERE user_id = ?2 AND code_hash = ?5 AND used_by = ?6
        )
          AND EXISTS (
            SELECT 1 FROM totp_login_challenges WHERE id = ?7 AND claimed_by = ?6
          )`,
    ).bind(input.sessionHash, input.row.user_id, input.expiresAt, input.now, codeHash, input.operationId, input.challengeHash),
    input.env.DB.prepare(
      `DELETE FROM totp_login_challenges WHERE id = ?1 AND claimed_by = ?2`,
    ).bind(input.challengeHash, input.operationId),
  ])
}

async function claimByTotpCode(input: {
  env: Env
  row: TotpLoginRow
  code: unknown
  operationId: string
  challengeHash: string
  sessionHash: string
  expiresAt: number
  now: number
  throttle: { failureKeys: string[]; workKey: string }
  workKey: string
}): Promise<D1Result[]> {
  const secret = await decryptTotpSecret(input.env, input.row.user_id, input.row.secret_ciphertext)
  if (!secret) throw factorUnavailable()
  const step = await matchTotpCode(secret, input.code, input.now)
  if (step == null) await rejectFactor(input.env.DB, input.throttle, 'code', input.workKey)
  return input.env.DB.batch([
    input.env.DB.prepare(
      `UPDATE totp_credentials SET
         last_used_step = ?1,
         last_used_by = ?2,
         updated_at = ?3
       WHERE user_id = ?4
         AND enabled_at IS NOT NULL
         AND recovery_generation = ?5
         AND (last_used_step IS NULL OR last_used_step < ?1)
         AND EXISTS (
           SELECT 1 FROM totp_login_challenges
            WHERE id = ?6 AND user_id = ?4 AND expires_at > ?3 AND claimed_by IS NULL
         )`,
    ).bind(step, input.operationId, input.now, input.row.user_id, input.row.recovery_generation, input.challengeHash),
    input.env.DB.prepare(
      `UPDATE totp_login_challenges SET claimed_by = ?1
        WHERE id = ?2 AND user_id = ?3 AND expires_at > ?4 AND claimed_by IS NULL
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?3 AND last_used_by = ?1
          )`,
    ).bind(input.operationId, input.challengeHash, input.row.user_id, input.now),
    input.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (
          SELECT 1 FROM totp_credentials
           WHERE user_id = ?2 AND last_used_by = ?5
        )
          AND EXISTS (
            SELECT 1 FROM totp_login_challenges WHERE id = ?6 AND claimed_by = ?5
          )`,
    ).bind(input.sessionHash, input.row.user_id, input.expiresAt, input.now, input.operationId, input.challengeHash),
    input.env.DB.prepare(
      `DELETE FROM totp_login_challenges WHERE id = ?1 AND claimed_by = ?2`,
    ).bind(input.challengeHash, input.operationId),
  ])
}

export async function completeTotpLogin(input: {
  env: Env
  challengeToken: unknown
  code: unknown
  now?: number
}): Promise<CompletedTotpLogin> {
  const now = input.now ?? Date.now()
  if (!isOpaqueToken(input.challengeToken)) throw challengeExpired()
  const challengeHash = await hashOpaqueToken(input.challengeToken)
  const workKey = `totp-login-work:${challengeHash}`
  await consumeWorkBudget(input.env.DB, workKey)
  const row = await loginChallengeRow(input.env.DB, challengeHash, now)
  if (!row) throw challengeExpired()
  const throttle = factorThrottle(row.user_id, challengeHash)
  await assertFactorUnlocked(input.env.DB, throttle)
  const recoveryCode = normalizeRecoveryCode(input.code)
  const operationId = newId()
  const sessionToken = newSessionToken()
  const sessionHash = await hashToken(sessionToken)
  const expiresAt = now + SESSION_TTL_MS
  const isRecoveryCodeUsed = recoveryCode != null
  const claim = {
    env: input.env,
    row,
    operationId,
    challengeHash,
    sessionHash,
    expiresAt,
    now,
  }
  const results = isRecoveryCodeUsed
    ? await claimByRecoveryCode({ ...claim, recoveryCode })
    : await claimByTotpCode({ ...claim, code: input.code, throttle, workKey })
  return finishTotpLogin(input.env, throttle, workKey, row, results, isRecoveryCodeUsed, sessionToken)
}

async function finishTotpLogin(
  env: Env,
  throttle: { failureKeys: string[]; workKey: string },
  workKey: string,
  row: TotpLoginRow,
  results: D1Result[],
  isRecoveryCodeUsed: boolean,
  sessionToken: string,
): Promise<CompletedTotpLogin> {
  if (
    !changed(results[0]) ||
    !changed(results[1]) ||
    !changed(results[2]) ||
    !changed(results[3])
  ) {
    await rejectFactor(env.DB, throttle, 'code', workKey)
  }
  await clearFactorAttempts(env.DB, throttle, workKey)
  const remaining = isRecoveryCodeUsed
    ? await countRecoveryCodes(env.DB, row.user_id, row.recovery_generation)
    : null
  return {
    userId: row.user_id,
    sessionToken,
    recoveryCodeUsed: isRecoveryCodeUsed,
    recoveryCodesRemaining: remaining,
  }
}

function challengeExpired(): ApiError {
  return new ApiError(401, 'two_factor_challenge_expired', 'The sign-in verification expired. Enter your password again')
}
