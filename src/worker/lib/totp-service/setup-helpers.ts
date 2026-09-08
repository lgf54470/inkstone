import { changed } from './factor'
import { clearFactorAttempts } from './factor'
import { setupExpired } from './factor'

export async function beginSetupBatch(db: D1Database, input: {
  userId: string
  secretCiphertext: string
  setupTokenHash: string
  sessionId: string
  expiresAt: number
  now: number
}): Promise<D1Result[]> {
  return db.batch([
    db.prepare(
      `INSERT INTO totp_credentials (
         user_id, secret_ciphertext, enabled_at,
         pending_token_hash, pending_session_id, pending_expires_at,
         recovery_generation, last_used_step, last_used_by, created_at, updated_at
       ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, '', NULL, NULL, ?6, ?6)
       ON CONFLICT(user_id) DO UPDATE SET
         secret_ciphertext = excluded.secret_ciphertext,
         pending_token_hash = excluded.pending_token_hash,
         pending_session_id = excluded.pending_session_id,
         pending_expires_at = excluded.pending_expires_at,
         recovery_generation = '',
         last_used_step = NULL,
         last_used_by = NULL,
         updated_at = excluded.updated_at
       WHERE totp_credentials.enabled_at IS NULL`,
    ).bind(
      input.userId,
      input.secretCiphertext,
      input.setupTokenHash,
      input.sessionId,
      input.expiresAt,
      input.now,
    ),
    db.prepare(
      `DELETE FROM totp_recovery_codes
        WHERE user_id = ?1
          AND NOT EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND enabled_at IS NOT NULL
          )`,
    ).bind(input.userId),
  ])
}

export async function completeSetupEnable(input: {
  db: D1Database
  userId: string
  sessionId: string
  setupTokenHash: string
  recoveryGeneration: string
  now: number
  hashes: string[]
  throttle: { failureKeys: string[]; workKey: string }
}): Promise<void> {
  const statements: D1PreparedStatement[] = [
    input.db.prepare(
      `UPDATE totp_credentials SET
         enabled_at = ?1,
         pending_token_hash = NULL,
         pending_session_id = NULL,
         pending_expires_at = NULL,
         recovery_generation = ?2,
         last_used_step = NULL,
         last_used_by = NULL,
         updated_at = ?1
       WHERE user_id = ?3
         AND enabled_at IS NULL
         AND pending_token_hash = ?4
         AND pending_session_id = ?5
         AND pending_expires_at > ?1`,
    ).bind(input.now, input.recoveryGeneration, input.userId, input.setupTokenHash, input.sessionId),
    input.db.prepare(
      `DELETE FROM sessions
        WHERE user_id = ?1 AND id != ?2
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?3 AND enabled_at = ?4
          )`,
    ).bind(input.userId, input.sessionId, input.recoveryGeneration, input.now),
    input.db.prepare(
      `DELETE FROM totp_recovery_codes
        WHERE user_id = ?1
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?2 AND enabled_at = ?3
          )`,
    ).bind(input.userId, input.recoveryGeneration, input.now),
  ]
  pushSetupRecoveryInserts(input.db, statements, input)
  const results = await input.db.batch(statements)
  if (!changed(results[0])) throw setupExpired()
  await clearFactorAttempts(input.db, input.throttle)
}


function pushSetupRecoveryInserts(db: D1Database, statements: D1PreparedStatement[], input: {
  userId: string
  recoveryGeneration: string
  now: number
  hashes: string[]
}): void {
  for (const hash of input.hashes) {
    statements.push(
      db.prepare(
        `INSERT INTO totp_recovery_codes
           (user_id, code_hash, generation, created_at, used_at, used_by)
         SELECT ?1, ?2, ?3, ?4, NULL, NULL
          WHERE EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?3 AND enabled_at = ?4
          )`,
      ).bind(input.userId, hash, input.recoveryGeneration, input.now),
    )
  }
}

export async function regenerateRecoveryStatements(db: D1Database, input: {
  userId: string
  recoveryGeneration: string
  operationId: string
  step: number
  now: number
  previousGeneration: string
  hashes: string[]
}): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE totp_credentials SET
         recovery_generation = ?1,
         last_used_step = ?2,
         last_used_by = ?3,
         updated_at = ?4
       WHERE user_id = ?5
         AND enabled_at IS NOT NULL
         AND recovery_generation = ?6
         AND (last_used_step IS NULL OR last_used_step < ?2)`,
    ).bind(
      input.recoveryGeneration,
      input.step,
      input.operationId,
      input.now,
      input.userId,
      input.previousGeneration,
    ),
    db.prepare(
      `DELETE FROM totp_recovery_codes
        WHERE user_id = ?1
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1
               AND recovery_generation = ?2
               AND last_used_by = ?3
          )`,
    ).bind(input.userId, input.recoveryGeneration, input.operationId),
  ]
  for (const hash of input.hashes) {
    statements.push(
      db.prepare(
        `INSERT INTO totp_recovery_codes
           (user_id, code_hash, generation, created_at, used_at, used_by)
         SELECT ?1, ?2, ?3, ?4, NULL, NULL
          WHERE EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1
               AND recovery_generation = ?3
               AND last_used_by = ?5
          )`,
      ).bind(input.userId, hash, input.recoveryGeneration, input.now, input.operationId),
    )
  }
  return statements
}

export async function disableByRecoveryCodeStatements(db: D1Database, input: {
  userId: string
  recoveryGeneration: string
  codeHash: string
  operationId: string
  now: number
}): Promise<D1PreparedStatement[]> {
  return [
    db.prepare(
      `UPDATE totp_recovery_codes SET used_at = ?1, used_by = ?2
        WHERE user_id = ?3
          AND code_hash = ?4
          AND generation = ?5
          AND used_at IS NULL`,
    ).bind(input.now, input.operationId, input.userId, input.codeHash, input.recoveryGeneration),
    db.prepare(
      `UPDATE totp_credentials SET recovery_generation = ?1, updated_at = ?2
        WHERE user_id = ?3
          AND enabled_at IS NOT NULL
          AND recovery_generation = ?4
          AND EXISTS (
            SELECT 1 FROM totp_recovery_codes
             WHERE user_id = ?3 AND code_hash = ?5 AND used_by = ?1
          )`,
    ).bind(input.operationId, input.now, input.userId, input.recoveryGeneration, input.codeHash),
  ]
}

export async function disableByTotpCodeStatement(db: D1Database, input: {
  userId: string
  recoveryGeneration: string
  operationId: string
  step: number
  now: number
}): Promise<D1PreparedStatement[]> {
  return [
    db.prepare(
      `UPDATE totp_credentials SET
         recovery_generation = ?1,
         last_used_step = ?2,
         last_used_by = ?1,
         updated_at = ?3
       WHERE user_id = ?4
         AND enabled_at IS NOT NULL
         AND recovery_generation = ?5
         AND (last_used_step IS NULL OR last_used_step < ?2)`,
    ).bind(input.operationId, input.step, input.now, input.userId, input.recoveryGeneration),
  ]
}

export async function disableTeardownStatements(db: D1Database, input: {
  userId: string
  sessionId: string
  operationId: string
}): Promise<D1PreparedStatement[]> {
  return [
    db.prepare(
      `DELETE FROM sessions
        WHERE user_id = ?1 AND id != ?2
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?3
          )`,
    ).bind(input.userId, input.sessionId, input.operationId),
    db.prepare(
      `DELETE FROM totp_login_challenges
        WHERE user_id = ?1
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?2
          )`,
    ).bind(input.userId, input.operationId),
    db.prepare(
      `DELETE FROM totp_recovery_codes
        WHERE user_id = ?1
          AND EXISTS (
            SELECT 1 FROM totp_credentials
             WHERE user_id = ?1 AND recovery_generation = ?2
          )`,
    ).bind(input.userId, input.operationId),
    db.prepare(
      `DELETE FROM totp_credentials
        WHERE user_id = ?1 AND recovery_generation = ?2`,
    ).bind(input.userId, input.operationId),
  ]
}
