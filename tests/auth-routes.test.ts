import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `a${String(++H.counter).padStart(25, 'c')}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { authRoutes } from '../src/worker/routes/auth'
import { rowToUser, USER_COLUMNS } from '../src/worker/middleware/auth'
import { createSession } from '../src/worker/lib/session-store'
import { hashPassword } from '../src/worker/lib/password'
import { errorResponse } from '../src/worker/lib/errors'
import { createD1Database as createDb, runSql, queryRows, queryFirst, type D1Shim } from './d1-harness'

const LEGACY_COOKIE = 'inkstone_session'

let db: D1Shim
let authedUserId: string | null = null
let presentedSessionId: string | null = null

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/auth/*', async (c, next) => {
    if (authedUserId) {
      const row = await c.env.DB.prepare(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = ?1`,
      ).bind(authedUserId).first<Parameters<typeof rowToUser>[0]>()
      if (row) {
        c.set('user', rowToUser(row))
        c.set('userId', row.id)
        c.set('sessionId', presentedSessionId ?? '')
      }
    }
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/auth', authRoutes)
  return app
}

async function makeDb(): Promise<void> {
  const { TABLE_STATEMENTS } = await import('../src/worker/db/schema/tables')
  const { INDEX_STATEMENTS } = await import('../src/worker/db/schema/indexes')
  db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, { DB: db as unknown as D1Database } as unknown as AppBindings['Bindings'], {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext)
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function seedUserWithPassword(username: string, password: string): Promise<string> {
  const id = `u-${++H.counter}`
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, role, settings, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?2, ?2, '', 'owner', '{}', ?4, ?4)`,
    id, username, await hashPassword(password), H.now,
  )
  return id
}

async function sessionCount(userId: string): Promise<number> {
  const row = await queryFirst(db, `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1`, userId)
  return Number(row?.n ?? 0)
}

describe('auth register (real D1)', () => {
  it('makes the first registered account the owner and seeds starter notes', async () => {
    await makeDb()
    const app = makeApp()
    const res = await postJson(app, '/api/auth/register', { username: 'alice', password: 'password123' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.user.role).toBe('owner')
    expect(res.headers.get('set-cookie')).toContain(`${LEGACY_COOKIE}=`)
    const notes = await queryRows(db, `SELECT id FROM notes`)
    expect(notes.length).toBeGreaterThanOrEqual(1)
  })

  it('closes registration once an owner exists and reports closed instead of creating accounts', async () => {
    await makeDb()
    await seedUserWithPassword('alice', 'password123')
    const app = makeApp()
    const res = await postJson(app, '/api/auth/register', { username: 'bob', password: 'password123' })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('registration_closed')
    const users = await queryRows(db, `SELECT id FROM users`)
    expect(users).toHaveLength(1)
  })

  it('creates members when registration is open and rejects duplicate usernames', async () => {
    await makeDb()
    await seedUserWithPassword('alice', 'password123')
    await runSql(db, `INSERT INTO app_meta (key, value) VALUES ('setting:allow_registration', '1')`)
    const app = makeApp()

    const bob = await postJson(app, '/api/auth/register', { username: 'bob', password: 'password123' })
    expect(bob.status).toBe(201)
    expect((await bob.json()).user.role).toBe('member')

    const duplicate = await postJson(app, '/api/auth/register', { username: 'bob', password: 'password123' })
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('username_taken')
  })

  it('rejects malformed usernames and weak passwords before touching the database', async () => {
    await makeDb()
    const app = makeApp()
    const badName = await postJson(app, '/api/auth/register', { username: 'Bad Name!', password: 'password123' })
    expect(badName.status).toBe(400)
    expect((await badName.json()).error.code).toBe('invalid_username')

    const weak = await postJson(app, '/api/auth/register', { username: 'alice', password: 'short' })
    expect(weak.status).toBe(400)
    expect((await weak.json()).error.code).toBe('weak_password')
    expect(await queryRows(db, `SELECT id FROM users`)).toHaveLength(0)
  })
})

describe('auth login (real D1)', () => {
  it('rejects wrong credentials and accepts the right ones with a session cookie', async () => {
    await makeDb()
    await seedUserWithPassword('alice', 'password123')
    const app = makeApp()

    const wrong = await postJson(app, '/api/auth/login', { username: 'alice', password: 'wrong-password' })
    expect(wrong.status).toBe(401)
    expect((await wrong.json()).error.code).toBe('invalid_credentials')

    const right = await postJson(app, '/api/auth/login', { username: 'alice', password: 'password123' })
    expect(right.status).toBe(200)
    expect(right.headers.get('set-cookie')).toContain(`${LEGACY_COOKIE}=`)
  })

  it('locks the identity after repeated failures even with the correct password', async () => {
    await makeDb()
    await seedUserWithPassword('alice', 'password123')
    const app = makeApp()
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await postJson(app, '/api/auth/login', { username: 'alice', password: 'wrong-password' })
      expect(res.status).toBe(401)
    }
    const locked = await postJson(app, '/api/auth/login', { username: 'alice', password: 'password123' })
    expect(locked.status).toBe(429)
    expect((await locked.json()).error.code).toBe('too_many_attempts')
  })

  it('returns a two-factor challenge instead of a session when TOTP is enabled', async () => {
    await makeDb()
    const userId = await seedUserWithPassword('alice', 'password123')
    await runSql(
      db,
      `INSERT INTO totp_credentials (user_id, secret_ciphertext, enabled_at, recovery_generation, created_at, updated_at) VALUES (?1, 'vault:secret', ?2, 'g1', ?2, ?2)`,
      userId, H.now,
    )
    const app = makeApp()
    const res = await postJson(app, '/api/auth/login', { username: 'alice', password: 'password123' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.twoFactorRequired).toBe(true)
    expect(typeof body.challengeToken).toBe('string')
    expect(res.headers.get('set-cookie')).toBeNull()
    const challenges = await queryRows(db, `SELECT id FROM totp_login_challenges`)
    expect(challenges).toHaveLength(1)
  })
})

describe('auth session lifecycle (real D1)', () => {
  it('changes the password, keeps the presented session, and destroys the others', async () => {
    await makeDb()
    const userId = await seedUserWithPassword('alice', 'password123')
    const tokenA = await createSession(db as unknown as D1Database, userId)
    const tokenB = await createSession(db as unknown as D1Database, userId)
    const sessionIds = (await queryRows(db, `SELECT id FROM sessions WHERE user_id = ?1`, userId))
      .map((row) => row.id as string)
    const sessionAId = sessionIds[0]!
    expect(sessionIds).toHaveLength(2)

    authedUserId = userId
    presentedSessionId = sessionAId
    try {
      const app = makeApp()
      const wrongCurrent = await postJson(app, '/api/auth/password', {
        currentPassword: 'not-the-password', newPassword: 'newpassword123',
      })
      expect(wrongCurrent.status).toBe(401)
      expect(await sessionCount(userId)).toBe(2)

      const ok = await postJson(app, '/api/auth/password', {
        currentPassword: 'password123', newPassword: 'newpassword123',
      }, { Cookie: `${LEGACY_COOKIE}=${tokenA}` })
      expect(ok.status).toBe(200)

      // Password rotation destroys the presented session too and replaces it
      // with a fresh one; every other device session is revoked.
      const remaining = await queryRows(db, `SELECT id FROM sessions WHERE user_id = ?1`, userId)
      expect(remaining).toHaveLength(1)
      expect(remaining.map((row) => row.id)).not.toContain(sessionAId)
      const revokedId = sessionIds.find((id) => id !== sessionAId)!
      expect(remaining.map((row) => row.id)).not.toContain(revokedId)
      expect(ok.headers.get('set-cookie')).toContain(`${LEGACY_COOKIE}=`)
      void tokenB
    } finally {
      authedUserId = null
      presentedSessionId = null
    }
  })

  it('destroys presented sessions on logout', async () => {
    await makeDb()
    const userId = await seedUserWithPassword('alice', 'password123')
    const tokenA = await createSession(db as unknown as D1Database, userId)
    const app = makeApp()
    const res = await postJson(app, '/api/auth/logout', {}, { Cookie: `${LEGACY_COOKIE}=${tokenA}` })
    expect(res.status).toBe(200)
    expect(await sessionCount(userId)).toBe(0)
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('reports an anonymous session envelope when no user is signed in', async () => {
    await makeDb()
    const app = makeApp()
    const res = await request(app, '/api/auth/session')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeNull()
    expect(body.site.initialized).toBe(false)
    expect(body.settings).toBeNull()
  })
})
