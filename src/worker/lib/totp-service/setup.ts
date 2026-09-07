import type { TotpLoginChallenge, TotpRecoveryCodesResult, TotpSetupInfo, TotpStatus } from '@shared/types';
import type { Env } from '../../env';
import { decryptTotpSecret, encryptTotpSecret } from '../crypto';
import { timingSafeEqual } from '../encoding';
import { ApiError } from '../errors';
import { newId } from '../id';
import { buildTotpUri, generateOpaqueToken, generateRecoveryCodes, generateTotpSecret, hashOpaqueToken, hashRecoveryCode, isOpaqueToken, matchTotpCode, normalizeRecoveryCode, TOTP_LOGIN_TTL_MS, TOTP_SETUP_TTL_MS } from '../totp';
import { beginFactorAttempt } from './factor';
import { changed } from './factor';
import { clearFactorAttempts } from './factor';
import { factorThrottle } from './factor';
import { factorUnavailable } from './factor';
import { loadCredential } from './factor';
import { rejectFactor } from './factor';
import { requireEnabledCredential } from './factor';
import { setupExpired } from './factor';
import { beginSetupBatch, completeSetupEnable, disableByRecoveryCodeStatements, disableByTotpCodeStatement, disableTeardownStatements, regenerateRecoveryStatements } from './setup-helpers';

export async function hasEnabledTotp(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS present FROM totp_credentials
      WHERE user_id = ?1 AND enabled_at IS NOT NULL`,
  ).bind(userId).first<{ present: number }>()
  return Boolean(row?.present)
}

export async function createTotpLoginChallenge(
  db: D1Database,
  userId: string,
  now = Date.now(),
): Promise<TotpLoginChallenge> {
  const challengeToken = generateOpaqueToken()
  const challengeHash = await hashOpaqueToken(challengeToken)
  const expiresAt = now + TOTP_LOGIN_TTL_MS
  await db.prepare(
    `INSERT INTO totp_login_challenges (id, user_id, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
  ).bind(challengeHash, userId, expiresAt, now).run()
  return { twoFactorRequired: true, challengeToken, expiresAt }
}

export async function getTotpStatus(env: Env, userId: string): Promise<TotpStatus> {
  const row = await env.DB.prepare(
    `SELECT c.enabled_at, COUNT(r.code_hash) AS recovery_codes
       FROM totp_credentials c
       LEFT JOIN totp_recovery_codes r
         ON r.user_id = c.user_id
        AND r.generation = c.recovery_generation
        AND r.used_at IS NULL
      WHERE c.user_id = ?1
      GROUP BY c.user_id, c.enabled_at`,
  ).bind(userId).first<{ enabled_at: number | null; recovery_codes: number }>()
  return {
    available: Boolean(env.CREDENTIAL_VAULT),
    enabled: row?.enabled_at != null,
    enabledAt: row?.enabled_at ?? null,
    recoveryCodesRemaining: row?.enabled_at == null ? 0 : Number(row.recovery_codes || 0),
  }
}

export async function startTotpSetup(input: {
  env: Env
  userId: string
  sessionId: string
  issuer: string
  account: string
  now?: number
}): Promise<TotpSetupInfo> {
  const now = input.now ?? Date.now()
  const secret = generateTotpSecret()
  const secretCiphertext = await encryptTotpSecret(input.env, input.userId, secret)
  const setupToken = generateOpaqueToken()
  const setupTokenHash = await hashOpaqueToken(setupToken)
  const expiresAt = now + TOTP_SETUP_TTL_MS
  const results = await beginSetupBatch(input.env.DB, {
    userId: input.userId,
    secretCiphertext,
    setupTokenHash,
    sessionId: input.sessionId,
    expiresAt,
    now,
  })
  if (!changed(results[0])) {
    throw new ApiError(409, 'two_factor_already_enabled', 'Two-step verification is already enabled')
  }
  return {
    setupToken,
    secret,
    uri: buildTotpUri({ secret, issuer: input.issuer, account: input.account }),
    expiresAt,
  }
}

export async function cancelTotpSetup(input: {
  db: D1Database
  userId: string
  sessionId: string
  setupToken: unknown
}): Promise<void> {
  if (!isOpaqueToken(input.setupToken)) return
  const setupTokenHash = await hashOpaqueToken(input.setupToken)
  await input.db.prepare(
    `DELETE FROM totp_credentials
      WHERE user_id = ?1
        AND enabled_at IS NULL
        AND pending_token_hash = ?2
        AND pending_session_id = ?3`,
  ).bind(input.userId, setupTokenHash, input.sessionId).run()
}

export async function confirmTotpSetup(input: {
  env: Env
  userId: string
  sessionId: string
  setupToken: unknown
  code: unknown
  now?: number
}): Promise<TotpRecoveryCodesResult & { enabledAt: number }> {
  const now = input.now ?? Date.now()
  const throttle = factorThrottle(input.userId, 'setup')
  await beginFactorAttempt(input.env.DB, throttle)
  if (!isOpaqueToken(input.setupToken)) {
    await rejectFactor(input.env.DB, throttle, 'setup')
  }
  const setupTokenHash = await hashOpaqueToken(input.setupToken as string)
  const credential = await loadCredential(input.env.DB, input.userId)
  if (
    !credential ||
    credential.enabled_at != null ||
    !credential.pending_token_hash ||
    !credential.pending_session_id ||
    !credential.pending_expires_at ||
    credential.pending_expires_at <= now ||
    credential.pending_session_id !== input.sessionId ||
    !timingSafeEqual(credential.pending_token_hash, setupTokenHash)
  ) {
    await rejectFactor(input.env.DB, throttle, 'setup')
  }

  const secret = await decryptTotpSecret(input.env, input.userId, credential!.secret_ciphertext)
  if (!secret) throw setupExpired()
  const step = await matchTotpCode(secret, input.code, now)
  if (step == null) return rejectFactor(input.env.DB, throttle, 'code')

  const recoveryCodes = generateRecoveryCodes()
  const recoveryGeneration = newId()
  const hashes = await Promise.all(
    recoveryCodes.map((code) => hashRecoveryCode(input.userId, normalizeRecoveryCode(code)!)),
  )
  await completeSetupEnable({
    db: input.env.DB,
    userId: input.userId,
    sessionId: input.sessionId,
    setupTokenHash,
    recoveryGeneration,
    now,
    hashes,
    throttle,
  })
  return {
    recoveryCodes,
    recoveryCodesRemaining: recoveryCodes.length,
    generatedAt: now,
    enabledAt: now,
  }
}

export async function regenerateRecoveryCodes(input: {
  env: Env
  userId: string
  code: unknown
  now?: number
}): Promise<TotpRecoveryCodesResult> {
  const now = input.now ?? Date.now()
  const throttle = factorThrottle(input.userId, 'recovery')
  await beginFactorAttempt(input.env.DB, throttle)
  const credential = await requireEnabledCredential(input.env, input.userId)
  const secret = await decryptTotpSecret(input.env, input.userId, credential.secret_ciphertext)
  if (!secret) throw factorUnavailable()
  const step = await matchTotpCode(secret, input.code, now)
  if (step == null) return rejectFactor(input.env.DB, throttle, 'code')

  const recoveryCodes = generateRecoveryCodes()
  const recoveryGeneration = newId()
  const operationId = newId()
  const hashes = await Promise.all(
    recoveryCodes.map((code) => hashRecoveryCode(input.userId, normalizeRecoveryCode(code)!)),
  )
  const statements = await regenerateRecoveryStatements(input.env.DB, {
    userId: input.userId,
    recoveryGeneration,
    operationId,
    step,
    now,
    previousGeneration: credential.recovery_generation,
    hashes,
  })
  const results = await input.env.DB.batch(statements)
  if (!changed(results[0])) await rejectFactor(input.env.DB, throttle, 'code')
  await clearFactorAttempts(input.env.DB, throttle)
  return {
    recoveryCodes,
    recoveryCodesRemaining: recoveryCodes.length,
    generatedAt: now,
  }
}

export async function disableTotp(input: {
  env: Env
  userId: string
  sessionId: string
  code: unknown
  now?: number
}): Promise<void> {
  const now = input.now ?? Date.now()
  const throttle = factorThrottle(input.userId, 'disable')
  await beginFactorAttempt(input.env.DB, throttle)
  const credential = await requireEnabledCredential(input.env, input.userId)
  const recoveryCode = normalizeRecoveryCode(input.code)
  const operationId = newId()
  let statements: D1PreparedStatement[]

  if (recoveryCode) {
    const codeHash = await hashRecoveryCode(input.userId, recoveryCode)
    statements = await disableByRecoveryCodeStatements(input.env.DB, {
      userId: input.userId,
      recoveryGeneration: credential.recovery_generation,
      codeHash,
      operationId,
      now,
    })
  } else {
    const secret = await decryptTotpSecret(input.env, input.userId, credential.secret_ciphertext)
    if (!secret) throw factorUnavailable()
    const step = await matchTotpCode(secret, input.code, now)
    if (step == null) return rejectFactor(input.env.DB, throttle, 'code')
    statements = await disableByTotpCodeStatement(input.env.DB, {
      userId: input.userId,
      recoveryGeneration: credential.recovery_generation,
      operationId,
      step,
      now,
    })
  }

  const teardown = await disableTeardownStatements(input.env.DB, {
    userId: input.userId,
    sessionId: input.sessionId,
    operationId,
  })
  statements.push(...teardown)
  const results = await input.env.DB.batch(statements)
  const factorAccepted = recoveryCode
    ? changed(results[0]) && changed(results[1])
    : changed(results[0])
  if (!factorAccepted || !changed(results.at(-1))) {
    await rejectFactor(input.env.DB, throttle, 'code')
  }
  await clearFactorAttempts(input.env.DB, throttle)
}
