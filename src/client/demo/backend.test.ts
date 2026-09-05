import { describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '../lib/runtime'
import { createDemoBackend } from './backend'

type DemoBackend = ReturnType<typeof createDemoBackend>

function call(backend: DemoBackend, path: string, init?: RequestInit): Promise<Response> {
  return backend.fetch(new Request(`http://demo.local${path}`, init))
}

describe('demo backend', () => {
  it('serves public endpoints without authentication', async () => {
    const backend = createDemoBackend()
    const site = await call(backend, '/api/site')
    expect(site.status).toBe(200)
    expect(await site.json()).toMatchObject({ name: expect.any(String) })
    const session = await call(backend, '/api/auth/session')
    expect(session.status).toBe(200)
  })

  it('rejects protected endpoints until login, then serves them', async () => {
    const backend = createDemoBackend()
    const before = await call(backend, '/api/notes')
    expect(before.status).toBe(401)

    const login = await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DEMO_CREDENTIALS.username, password: DEMO_CREDENTIALS.password }),
    })
    expect(login.status).toBe(200)

    const after = await call(backend, '/api/notes')
    expect(after.status).toBe(200)
    const body = await after.json()
    expect(body).toMatchObject({ notes: expect.any(Array) })
  })

  it('rejects bad credentials and applies the 404 catch-all after login', async () => {
    const backend = createDemoBackend()
    const bad = await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DEMO_CREDENTIALS.username, password: 'wrong' }),
    })
    expect(bad.status).toBe(401)

    await call(backend, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEMO_CREDENTIALS),
    })
    const missing = await call(backend, '/api/does-not-exist')
    expect(missing.status).toBe(404)
  })
})
