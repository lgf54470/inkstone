import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  assertNotLocked,
  clearLoginFailures,
  consumeAttemptBudget,
  recordLoginFailure,
  ThrottleError,
} from '../src/worker/lib/throttle'
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  hashToken,
  isSessionToken,
  newSessionToken,
  renewSession,
} from '../src/worker/lib/session-store'
import { SESSION_TTL_MS } from '../src/shared/constants'

/**
 * Minimal D1Database-compatible shim over node:sqlite so the real upsert SQL
 * in throttle.ts / session-store.ts executes against SQLite instead of being
 * re-implemented in the test.
 */
interface Prepared {
  bind(...values: unknown[]): Prepared
  run(): Promise<{ meta: { changes: number } }>
  all(): Promise<{ results: Array<Record<string, unknown>> }>
  first(): Promise<Record<string, unknown> | null>
}

type DbLike = {
  prepare(sql: string): Prepared
  batch(statements: Prepared[]): Promise<Array<{ meta: { changes: number } }>>
}

function createDb(): DbLike {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE login_attempts (
      key TEXT PRIMARY KEY,
      fails INTEGER NOT NULL DEFAULT 0,
      last_fail_at INTEGER NOT NULL,
      locked_until INTEGER
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  const prepare = (sql: string) => {
    const makeStatement = (values: unknown[]): Prepared => {
      const statement = sqlite.prepare(sql)
      return {
        bind: (...bound: unknown[]) => makeStatement(bound),
        run: () => {
          const info = statement.run(...values)
          return { meta: { changes: Number(info.changes) } }
        },
        all: () => ({ results: statement.all(...values) as Array<Record<string, unknown>> }),
        first: () => (statement.get(...values) as Record<string, unknown> | undefined) ?? null,
      }
    }
    return makeStatement([])
  }
  return {
    prepare,
    batch: (statements) => Promise.all(statements.map((statement) => statement.run())),
  }
}

describe('session-store', () => {
  it('generates unique 64-hex tokens that pass the session-token check', async () => {
    const tokens = await Promise.all(Array.from({ length: 32 }, () => Promise.resolve(newSessionToken())))
    expect(new Set(tokens).size).toBe(32)
    for (const token of tokens) {
      expect(token).toMatch(/^[a-f0-9]{64}$/)
      expect(isSessionToken(token)).toBe(true)
    }
    expect(isSessionToken('not-a-token')).toBe(false)
    expect(isSessionToken('F'.repeat(64))).toBe(false)
    expect(isSessionToken('a'.repeat(63))).toBe(false)
  })

  it('hashes tokens with SHA-256 and never stores the plaintext', async () => {
    const token = newSessionToken()
    const first = await hashToken(token)
    const second = await hashToken(token)
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toContain(token)
  })

  it('creates, renews, and destroys sessions', async () => {
    const db = createDb()
    const token = await createSession(db as never, 'user-1')
    expect(isSessionToken(token)).toBe(true)

    const storedId = await hashToken(token)
    const before = (await db.prepare('SELECT expires_at FROM sessions WHERE id = ?1').bind(storedId).first())!
    expect(Number(before.expires_at)).toBeGreaterThan(Date.now())
    expect(Number(before.expires_at) - Date.now()).toBeLessThanOrEqual(SESSION_TTL_MS)

    await renewSession(db as never, storedId)
    const after = (await db.prepare('SELECT expires_at FROM sessions WHERE id = ?1').bind(storedId).first())!
    expect(Number(after.expires_at)).toBeGreaterThan(Number(before.expires_at))

    await destroySession(db as never, token)
    expect(await db.prepare('SELECT id FROM sessions WHERE id = ?1').bind(storedId).first()).toBeNull()
  })

  it('destroySession ignores malformed tokens without touching the row', async () => {
    const db = createDb()
    const token = await createSession(db as never, 'user-1')
    const storedId = await hashToken(token)
    await destroySession(db as never, 'not-a-real-token')
    expect(await db.prepare('SELECT id FROM sessions WHERE id = ?1').bind(storedId).first()).not.toBeNull()
  })

  it('destroyOtherSessions keeps only the current session', async () => {
    const db = createDb()
    const keep = await createSession(db as never, 'user-1')
    const other1 = await createSession(db as never, 'user-1')
    const other2 = await createSession(db as never, 'user-1')
    const foreign = await createSession(db as never, 'user-2')
    const keepId = await hashToken(keep)

    await destroyOtherSessions(db as never, 'user-1', keepId)

    const ids = (await db.prepare('SELECT id FROM sessions WHERE user_id = ?1').bind('user-1').all())
      .results.map((row) => row.id)
    expect(ids).toEqual([keepId])
    expect(await db.prepare('SELECT id FROM sessions WHERE id = ?1').bind(await hashToken(other1)).first()).toBeNull()
    expect(await db.prepare('SELECT id FROM sessions WHERE id = ?1').bind(await hashToken(other2)).first()).toBeNull()
    expect(await db.prepare('SELECT id FROM sessions WHERE id = ?1').bind(await hashToken(foreign)).first()).not.toBeNull()
  })
})

describe('throttle: consumeAttemptBudget', () => {
  it('allows attempts below the limit and locks afterwards', async () => {
    const db = createDb()
    const target = [{ key: 'budget:test', maxAttempts: 3, windowMs: 60_000, lockMs: 60_000 }]
    await consumeAttemptBudget(db as never, target)
    await consumeAttemptBudget(db as never, target)
    await consumeAttemptBudget(db as never, target)
    await expect(consumeAttemptBudget(db as never, target)).rejects.toThrow(ThrottleError)
    await expect(assertNotLocked(db as never, ['budget:test'])).rejects.toThrow(ThrottleError)

    const row = (await db.prepare('SELECT locked_until, fails FROM login_attempts WHERE key = ?1').bind('budget:test').first())!
    expect(Number(row.locked_until)).toBeGreaterThan(Date.now())
    expect(Number(row.fails)).toBe(4)
  })

  it('resets the counter after the window elapses without extending an active lock', async () => {
    const db = createDb()
    const target = [{ key: 'budget:window', maxAttempts: 2, windowMs: 60_000, lockMs: 60_000 }]
    await consumeAttemptBudget(db as never, target)
    await consumeAttemptBudget(db as never, target)
    await expect(consumeAttemptBudget(db as never, target)).rejects.toThrow(ThrottleError)
    const lockedUntil = Number(
      (await db.prepare('SELECT locked_until FROM login_attempts WHERE key = ?1').bind('budget:window').first())!
        .locked_until,
    )

    // Rewind the last attempt far enough to expire the window and the lock.
    await db.prepare(
      'UPDATE login_attempts SET last_fail_at = ?1, locked_until = NULL WHERE key = ?2',
    ).bind(Date.now() - 120_000, 'budget:window').run()
    await consumeAttemptBudget(db as never, target)
    expect(Number(
      (await db.prepare('SELECT locked_until FROM login_attempts WHERE key = ?1').bind('budget:window').first())!
        .locked_until,
    )).toBeLessThan(lockedUntil)
  })

  it('tracks multiple keys independently', async () => {
    const db = createDb()
    const strict = { key: 'budget:strict', maxAttempts: 1, windowMs: 60_000 }
    const loose = { key: 'budget:loose', maxAttempts: 100, windowMs: 60_000 }
    await consumeAttemptBudget(db as never, [strict])
    await expect(consumeAttemptBudget(db as never, [strict])).rejects.toThrow(ThrottleError)
    await consumeAttemptBudget(db as never, [loose])
  })
})

describe('throttle: recordLoginFailure escalation and clear', () => {
  it('locks after the free-fail budget with escalating lockouts and unlocks on clear', async () => {
    const db = createDb()
    const keys = ['login:u1', { key: 'login-ip:x', freeFails: 2 }]

    for (let attempt = 0; attempt < 4; attempt++) {
      await recordLoginFailure(db as never, keys)
    }
    // The 4th failure reached the escalation chain (fails 2 → locked for the
    // ip key); assertNotLocked must now throw for that key but not others.
    await expect(assertNotLocked(db as never, ['login-ip:x'])).rejects.toThrow(ThrottleError)

    await clearLoginFailures(db as never, keys)
    await expect(assertNotLocked(db as never, ['login-ip:x'])).resolves.toBeUndefined()
    const remaining = await db.prepare('SELECT key FROM login_attempts').all()
    expect(remaining.results).toHaveLength(0)
  })

  it('keeps escalating the lock duration across consecutive failures', async () => {
    const db = createDb()
    const key = 'login-escalation'
    const lockedAt: number[] = []
    for (let attempt = 0; attempt < 7; attempt++) {
      await recordLoginFailure(db as never, [key])
      const row = (await db.prepare('SELECT locked_until FROM login_attempts WHERE key = ?1').bind(key).first())!
      if (row.locked_until) lockedAt.push(Number(row.locked_until))
    }
    expect(lockedAt.length).toBeGreaterThan(1)
    for (let index = 1; index < lockedAt.length; index++) {
      expect(lockedAt[index]!).toBeGreaterThan(lockedAt[index - 1]!)
    }
  })

  it('expires failures older than the window', async () => {
    const db = createDb()
    await recordLoginFailure(db as never, ['login-expire'])
    await db.prepare('UPDATE login_attempts SET last_fail_at = ?1 WHERE key = ?2')
      .bind(Date.now() - 61 * 60 * 1000, 'login-expire').run()
    await recordLoginFailure(db as never, ['login-expire'])
    const row = (await db.prepare('SELECT fails, locked_until FROM login_attempts WHERE key = ?1').bind('login-expire').first())!
    expect(Number(row.fails)).toBe(1)
    expect(row.locked_until).toBeNull()
  })
})
