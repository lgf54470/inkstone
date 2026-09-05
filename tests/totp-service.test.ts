import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const H = vi.hoisted(() => ({
  SECRET: 'A'.repeat(32),
  TOKEN: 'A'.repeat(43),
  CODE: 'AAAAAAAAAAAAAAAA',
  SESSION_TOKEN: 'ab'.repeat(32),
  OP: 'operation-1',
}))

vi.mock('../src/worker/lib/crypto', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    encryptTotpSecret: async () => `ct:${H.SECRET}`,
    decryptTotpSecret: async (_env: unknown, _userId: string, stored: string) =>
      stored.startsWith('ct:') ? stored.slice(3) : null,
  }
})

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => H.OP }
})

vi.mock('../src/worker/lib/session-store', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newSessionToken: () => H.SESSION_TOKEN }
})

vi.mock('../src/worker/lib/totp', async (importOriginal) => {
  const actual = await importOriginal()
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return {
    ...actual,
    generateTotpSecret: () => H.SECRET,
    generateOpaqueToken: () => H.TOKEN,
    generateRecoveryCodes: (count = 10) =>
      Array.from({ length: count }, (_, i) => 'AAAAAAAAAAAAAAA' + ALPHABET[i % ALPHABET.length]!),
  }
})

import type { Env } from '../src/worker/env'
import { hashOpaqueToken, hashRecoveryCode, totpCodeForStep } from '../src/worker/lib/totp'
import {
  cancelTotpSetup,
  completeTotpLogin,
  confirmTotpSetup,
  createTotpLoginChallenge,
  disableTotp,
  getTotpStatus,
  hasEnabledTotp,
  regenerateRecoveryCodes,
  startTotpSetup,
} from '../src/worker/lib/totp-service'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const NOW = 2_000_000_000_000
const TTL = 300_000
const USER = 'user-1'
const SESSION_ID = 'session-1'







async function validCode(now = NOW): Promise<string> {
  return totpCodeForStep(H.SECRET, Math.floor(now / 1000 / 30))
}

async function wrongCode(now = NOW): Promise<string> {
  const valid = await validCode(now)
  const flipped = String((Number(valid) + 1) % 1_000_000).padStart(6, '0')
  return flipped === valid ? '000000' : flipped
}

async function seedEnabledCredential(db: DbShim): Promise<void> {
  await runSql(
    db,
    `INSERT INTO totp_credentials
       (user_id, secret_ciphertext, enabled_at, recovery_generation,
        last_used_step, last_used_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5, ?5)`,
    USER,
    `ct:${H.SECRET}`,
    NOW - 3_600_000,
    'gen-seed',
    NOW,
  )
}

async function seedRecoveryCode(db: DbShim, generation = 'gen-seed'): Promise<void> {
  const codeHash = await hashRecoveryCode(USER, H.CODE)
  await runSql(
    db,
    `INSERT INTO totp_recovery_codes (user_id, code_hash, generation, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
    USER,
    codeHash,
    generation,
    NOW,
  )
}

async function seedChallenge(db: DbShim, expiresAt = NOW + TTL): Promise<string> {
  const challengeHash = await hashOpaqueToken(H.TOKEN)
  await runSql(
    db,
    `INSERT INTO totp_login_challenges (id, user_id, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
    challengeHash,
    USER,
    expiresAt,
    NOW,
  )
  return challengeHash
}

function envOf(db: DbShim): Env {
  return { DB: db as unknown as D1Database, CREDENTIAL_VAULT: {} } as unknown as Env
}

async function expectError(run: () => Promise<unknown>, status: number, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({ status, code })
}

describe('startTotpSetup', () => {
  it('creates a pending credential and returns uri metadata', async () => {
    const db = createDb()
    const result = await startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'me@x.io', now: NOW })
    expect(result.secret).toBe(H.SECRET)
    expect(result.setupToken).toBe(H.TOKEN)
    expect(result.uri).toContain('otpauth://totp/')
    expect(result.expiresAt).toBe(NOW + 600_000)
    const row = await firstRow(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(row?.enabled_at).toBeNull()
    expect(row?.pending_session_id).toBe(SESSION_ID)
    expect(row?.pending_token_hash).toBe(await hashOpaqueToken(H.TOKEN))
  })

  it('throws 409 when two-step verification is already enabled', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await expectError(
      () => startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'a', now: NOW }),
      409,
      'two_factor_already_enabled',
    )
  })
})

describe('confirmTotpSetup', () => {
  it('enables the credential, revokes other sessions and persists 10 recovery codes', async () => {
    const db = createDb()
    await startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'a', now: NOW })
    await runSql(db, 'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)', 'sess-old', USER, NOW + 1, NOW)
    const result = await confirmTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, setupToken: H.TOKEN, code: await validCode(), now: NOW })
    expect(result.enabledAt).toBe(NOW)
    expect(result.recoveryCodesRemaining).toBe(10)
    expect(result.recoveryCodes).toHaveLength(10)
    const credential = await firstRow(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(credential?.enabled_at).toBe(NOW)
    expect(credential?.pending_token_hash).toBeNull()
    expect(credential?.pending_expires_at).toBeNull()
    const codes = await allRows(db, 'SELECT code_hash FROM totp_recovery_codes WHERE user_id = ?1', USER)
    expect(codes).toHaveLength(10)
    const sessions = await allRows(db, 'SELECT id FROM sessions WHERE user_id = ?1', USER)
    expect(sessions).toHaveLength(0)
  })

  it('rejects an invalid authenticator code', async () => {
    const db = createDb()
    await startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'a', now: NOW })
    const badCode = await wrongCode()
    await expectError(
      () => confirmTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, setupToken: H.TOKEN, code: badCode, now: NOW }),
      401,
      'invalid_two_factor_code',
    )
  })

  it('rejects a session mismatch as an expired setup', async () => {
    const db = createDb()
    await startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'a', now: NOW })
    const goodCode = await validCode()
    await expectError(
      () => confirmTotpSetup({ env: envOf(db), userId: USER, sessionId: 'other-session', setupToken: H.TOKEN, code: goodCode, now: NOW }),
      409,
      'two_factor_setup_expired',
    )
  })
})

describe('cancelTotpSetup', () => {
  it('removes the pending credential', async () => {
    const db = createDb()
    await startTotpSetup({ env: envOf(db), userId: USER, sessionId: SESSION_ID, issuer: 'Ink', account: 'a', now: NOW })
    await cancelTotpSetup({ db: db as unknown as D1Database, userId: USER, sessionId: SESSION_ID, setupToken: H.TOKEN })
    const rows = await allRows(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(rows).toHaveLength(0)
  })
})

describe('regenerateRecoveryCodes', () => {
  it('rotates the generation and swaps in a fresh set of codes', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedRecoveryCode(db)
    const result = await regenerateRecoveryCodes({ env: envOf(db), userId: USER, code: await validCode(), now: NOW })
    expect(result.recoveryCodes).toHaveLength(10)
    expect(result.recoveryCodesRemaining).toBe(10)
    const credential = await firstRow(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(credential?.recovery_generation).toBe(H.OP)
    const codes = await allRows(db, 'SELECT generation FROM totp_recovery_codes WHERE user_id = ?1', USER)
    expect(codes).toHaveLength(10)
    expect(codes.every((row) => row.generation === H.OP)).toBe(true)
  })

  it('rejects a wrong code', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedRecoveryCode(db)
    const badCode = await wrongCode()
    await expectError(
      () => regenerateRecoveryCodes({ env: envOf(db), userId: USER, code: badCode, now: NOW }),
      401,
      'invalid_two_factor_code',
    )
  })
})

describe('disableTotp', () => {
  it('disables with a valid authenticator code and removes the credential', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await runSql(db, 'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)', 'sess-other', USER, NOW + 1, NOW)
    await seedChallenge(db)
    await disableTotp({ env: envOf(db), userId: USER, sessionId: SESSION_ID, code: await validCode(), now: NOW })
    const credential = await firstRow(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(credential).toBeNull()
    const sessions = await allRows(db, 'SELECT id FROM sessions WHERE user_id = ?1', USER)
    expect(sessions).toHaveLength(0)
    const challenges = await allRows(db, 'SELECT * FROM totp_login_challenges WHERE user_id = ?1', USER)
    expect(challenges).toHaveLength(0)
  })

  it('disables with a recovery code', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedRecoveryCode(db)
    await disableTotp({ env: envOf(db), userId: USER, sessionId: SESSION_ID, code: H.CODE, now: NOW })
    const credential = await firstRow(db, 'SELECT * FROM totp_credentials WHERE user_id = ?1', USER)
    expect(credential).toBeNull()
  })

  it('rejects a wrong code', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    const badCode = await wrongCode()
    await expectError(
      () => disableTotp({ env: envOf(db), userId: USER, sessionId: SESSION_ID, code: badCode, now: NOW }),
      401,
      'invalid_two_factor_code',
    )
  })
})

describe('completeTotpLogin', () => {
  it('logs in with a valid authenticator code and opens a session', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedChallenge(db)
    const result = await completeTotpLogin({ env: envOf(db), challengeToken: H.TOKEN, code: await validCode(), now: NOW })
    expect(result).toMatchObject({ userId: USER, recoveryCodeUsed: false, recoveryCodesRemaining: null })
    const sessions = await allRows(db, 'SELECT * FROM sessions WHERE user_id = ?1', USER)
    expect(sessions).toHaveLength(1)
    const challenges = await allRows(db, 'SELECT * FROM totp_login_challenges WHERE user_id = ?1', USER)
    expect(challenges).toHaveLength(0)
    const credential = await firstRow(db, 'SELECT last_used_step FROM totp_credentials WHERE user_id = ?1', USER)
    expect(Number(credential?.last_used_step)).toBeGreaterThan(0)
  })

  it('logs in with an unused recovery code and reports the remaining count', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedChallenge(db)
    await seedRecoveryCode(db)
    const result = await completeTotpLogin({ env: envOf(db), challengeToken: H.TOKEN, code: H.CODE, now: NOW })
    expect(result).toMatchObject({ userId: USER, recoveryCodeUsed: true, recoveryCodesRemaining: 0 })
    const sessions = await allRows(db, 'SELECT * FROM sessions WHERE user_id = ?1', USER)
    expect(sessions).toHaveLength(1)
  })

  it('rejects a wrong code', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedChallenge(db)
    const badCode = await wrongCode()
    await expectError(
      () => completeTotpLogin({ env: envOf(db), challengeToken: H.TOKEN, code: badCode, now: NOW }),
      401,
      'invalid_two_factor_code',
    )
  })

  it('rejects an expired challenge and deletes it', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedChallenge(db, NOW - 1000)
    const goodCode = await validCode()
    await expectError(
      () => completeTotpLogin({ env: envOf(db), challengeToken: H.TOKEN, code: goodCode, now: NOW }),
      401,
      'two_factor_challenge_expired',
    )
    const challenges = await allRows(db, 'SELECT * FROM totp_login_challenges WHERE user_id = ?1', USER)
    expect(challenges).toHaveLength(0)
  })

  it('rejects an already-used recovery code', async () => {
    const db = createDb()
    await seedEnabledCredential(db)
    await seedChallenge(db)
    const codeHash = await hashRecoveryCode(USER, H.CODE)
    await runSql(
      db,
      `INSERT INTO totp_recovery_codes (user_id, code_hash, generation, created_at, used_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
      USER,
      codeHash,
      'gen-seed',
      NOW,
      NOW - 1000,
    )
    await expectError(
      () => completeTotpLogin({ env: envOf(db), challengeToken: H.TOKEN, code: H.CODE, now: NOW }),
      401,
      'invalid_two_factor_code',
    )
  })
})

describe('status and helpers', () => {
  it('getTotpStatus reports disabled then enabled with remaining codes', async () => {
    const db = createDb()
    expect(await getTotpStatus(envOf(db), USER)).toEqual({
      available: true,
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
    })
    await seedEnabledCredential(db)
    await seedRecoveryCode(db)
    expect(await getTotpStatus(envOf(db), USER)).toMatchObject({ enabled: true, recoveryCodesRemaining: 1 })
  })

  it('hasEnabledTotp reflects the credential state', async () => {
    const db = createDb()
    expect(await hasEnabledTotp(db as unknown as D1Database, USER)).toBe(false)
    await seedEnabledCredential(db)
    expect(await hasEnabledTotp(db as unknown as D1Database, USER)).toBe(true)
  })

  it('createTotpLoginChallenge inserts a hashed challenge', async () => {
    const db = createDb()
    const challenge = await createTotpLoginChallenge(db as unknown as D1Database, USER, NOW)
    expect(challenge.twoFactorRequired).toBe(true)
    expect(challenge.expiresAt).toBe(NOW + TTL)
    const rows = await allRows(db, 'SELECT * FROM totp_login_challenges')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(await hashOpaqueToken(challenge.challengeToken))
  })
})
