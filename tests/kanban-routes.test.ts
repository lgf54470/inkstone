import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { LIMITS } from '../src/shared/constants'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { kanbanRoutes } from '../src/worker/routes/kanban'

function fakeR2(initialFiles: Record<string, { body: string; mime: string; userId: string | null; size?: number }> = {}) {
  const store = new Map<string, { body: string; mime: string; userId: string | null; size?: number }>(Object.entries(initialFiles))

  return {
    put: vi.fn(async (key: string, bytes: Uint8Array, opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => {
      store.set(key, {
        body: new TextDecoder().decode(bytes),
        mime: opts.httpMetadata?.contentType || 'application/octet-stream',
        userId: opts.customMetadata?.userId ?? null,
      })
      return {}
    }),
    list: vi.fn(async (opts: { prefix?: string; cursor?: string } = {}) => {
      const objects = [...store.entries()]
        .filter(([key]) => !opts.prefix || key.startsWith(opts.prefix))
        .map(([key, found]) => ({
          key,
          size: found.size ?? found.body.length,
          ...(found.userId === null ? {} : { customMetadata: { userId: found.userId } }),
        }))
      return { objects, truncated: false, cursor: undefined }
    }),
    get: vi.fn(async (key: string) => {
      const found = store.get(key)
      if (!found) return null
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(found.body))
            controller.close()
          },
        }),
        size: found.body.length,
        customMetadata: found.userId === null ? undefined : { userId: found.userId },
        httpMetadata: { contentType: found.mime },
      }
    }),
    head: vi.fn(async (key: string) => {
      const found = store.get(key)
      if (!found) return null
      return {
        size: found.body.length,
        customMetadata: found.userId === null ? undefined : { userId: found.userId },
        httpMetadata: { contentType: found.mime },
      }
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function buildTestApp(r2 = fakeR2(), currentUserId: string | null = 'user-1') {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))

  app.use('*', async (c, next) => {
    if (currentUserId) c.set('userId', currentUserId)
    await next()
  })

  app.route('/api/kanban', kanbanRoutes)
  return { app, r2 }
}

describe('kanban backend routes', () => {
  it('serves dangerous MIME types (SVG, HTML) as attachment with CSP sandbox', async () => {
    const r2 = fakeR2({
      'kanban/default/test-evil.svg': {
        body: '<svg><script>alert(1)</script></svg>',
        mime: 'image/svg+xml',
        userId: 'user-1',
      },
      'kanban/default/test-safe.png': {
        body: 'fake-png-data',
        mime: 'image/png',
        userId: 'user-1',
      },
    })
    const { app } = buildTestApp(r2)

    const svgRes = await app.request('/api/kanban/file/default/test-evil.svg', {}, { FILES: r2 as never })
    expect(svgRes.status).toBe(200)
    expect(svgRes.headers.get('Content-Disposition')).toContain('attachment')
    expect(svgRes.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox")

    const pngRes = await app.request('/api/kanban/file/default/test-safe.png', {}, { FILES: r2 as never })
    expect(pngRes.status).toBe(200)
    expect(pngRes.headers.get('Content-Disposition')).toContain('inline')
    expect(pngRes.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox")
  })

  it('prevents IDOR: rejects deletion when file belongs to another user', async () => {
    const r2 = fakeR2({
      'kanban/default/user2-file.png': {
        body: 'data',
        mime: 'image/png',
        userId: 'user-2',
      },
    })
    const { app } = buildTestApp(r2, 'user-1')

    const res = await app.request(
      '/api/kanban/file/default/user2-file.png',
      { method: 'DELETE' },
      { FILES: r2 as never },
    )
    expect(res.status).toBe(403)
    expect(r2.delete).not.toHaveBeenCalled()
  })

  it('allows deletion when file belongs to the requesting user', async () => {
    const r2 = fakeR2({
      'kanban/default/my-file.png': {
        body: 'data',
        mime: 'image/png',
        userId: 'user-1',
      },
    })
    const { app } = buildTestApp(r2, 'user-1')

    const res = await app.request(
      '/api/kanban/file/default/my-file.png',
      { method: 'DELETE' },
      { FILES: r2 as never },
    )
    expect(res.status).toBe(200)
    expect(r2.delete).toHaveBeenCalledWith('kanban/default/my-file.png')
  })

  it('rejects an unauthenticated GET of a kanban file', async () => {
    const r2 = fakeR2({
      'kanban/default/my-file.png': { body: 'data', mime: 'image/png', userId: 'user-1' },
    })
    const { app } = buildTestApp(r2, null)

    const res = await app.request('/api/kanban/file/default/my-file.png', {}, { FILES: r2 as never })
    expect(res.status).toBe(401)
  })

  it('rejects GET of a file that belongs to another user', async () => {
    const r2 = fakeR2({
      'kanban/default/user2-file.png': { body: 'secret', mime: 'image/png', userId: 'user-2' },
    })
    const { app } = buildTestApp(r2, 'user-1')

    const res = await app.request('/api/kanban/file/default/user2-file.png', {}, { FILES: r2 as never })
    expect(res.status).toBe(403)
  })

  it('rejects GET when the stored object carries no owner metadata', async () => {
    const r2 = fakeR2({
      'kanban/default/legacy-file.png': { body: 'data', mime: 'image/png', userId: null },
    })
    const { app } = buildTestApp(r2, 'user-1')

    const res = await app.request('/api/kanban/file/default/legacy-file.png', {}, { FILES: r2 as never })
    expect(res.status).toBe(403)
  })

  it('rejects DELETE when the stored object carries no owner metadata', async () => {
    const r2 = fakeR2({
      'kanban/default/legacy-file.png': { body: 'data', mime: 'image/png', userId: null },
    })
    const { app } = buildTestApp(r2, 'user-1')

    const res = await app.request(
      '/api/kanban/file/default/legacy-file.png',
      { method: 'DELETE' },
      { FILES: r2 as never },
    )
    expect(res.status).toBe(403)
    expect(r2.delete).not.toHaveBeenCalled()
  })
})

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

function fakeDb(opts: { usageBytes?: number; lockedUntil?: number | null } = {}) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: opts.lockedUntil ? [{ locked_until: opts.lockedUntil }] : [] })),
        first: vi.fn(async () => ({ bytes: opts.usageBytes ?? 0 })),
        run: vi.fn(async () => ({})),
      })),
    })),
    batch: vi.fn(async () => ({ results: [] })),
  }
}

async function postUpload(app: ReturnType<typeof buildTestApp>['app'], env: Record<string, unknown>, bytes: Uint8Array = PNG_MAGIC) {
  const form = new FormData()
  form.append('file', new File([bytes], 'shot.png', { type: 'image/png' }))
  form.append('kanbanName', 'default')
  return app.request('/api/kanban/upload', { method: 'POST', body: form }, env)
}

describe('kanban upload validation', () => {
  it('keeps a real PNG under its image MIME', async () => {
    const r2 = fakeR2()
    const { app } = buildTestApp(r2)
    const res = await postUpload(app, { FILES: r2, DB: fakeDb() })
    expect(res.status).toBe(200)
    expect(r2.put.mock.calls[0][2]).toMatchObject({ httpMetadata: { contentType: 'image/png' } })
  })

  it('stores a file whose bytes contradict the reported image MIME as octet-stream', async () => {
    const r2 = fakeR2()
    const { app } = buildTestApp(r2)
    const res = await postUpload(app, { FILES: r2, DB: fakeDb() }, new TextEncoder().encode('print((1))'))
    expect(res.status).toBe(200)
    expect(r2.put.mock.calls[0][2]).toMatchObject({ httpMetadata: { contentType: 'application/octet-stream' } })
  })

  it('refuses uploads with 503 when object storage is not configured', async () => {
    const { app } = buildTestApp(fakeR2())
    const res = await postUpload(app, { DB: fakeDb() })
    expect(res.status).toBe(503)
  })

  it('refuses uploads with 429 when the hourly budget is exhausted', async () => {
    const r2 = fakeR2()
    const { app } = buildTestApp(r2)
    const db = fakeDb({ lockedUntil: Date.now() + 60_000 })
    const res = await postUpload(app, { FILES: r2, DB: db })
    expect(res.status).toBe(429)
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('refuses an upload that would cross the account quota through attachment usage', async () => {
    const r2 = fakeR2()
    const { app } = buildTestApp(r2)
    const res = await postUpload(app, { FILES: r2, DB: fakeDb({ usageBytes: LIMITS.attachmentQuotaBytesR2 }) })
    expect(res.status).toBe(413)
    expect(r2.put).not.toHaveBeenCalled()
  })

  it('counts this user stored kanban bytes toward the quota and ignores other users', async () => {
    const full = fakeR2({
      'kanban/default/mine.bin': { body: 'x', mime: 'application/octet-stream', userId: 'user-1', size: LIMITS.attachmentQuotaBytesR2 - 5 },
      'kanban/default/theirs.bin': { body: 'x', mime: 'application/octet-stream', userId: 'user-2', size: 1_000_000 },
    })
    const fullRes = await postUpload(buildTestApp(full).app, { FILES: full, DB: fakeDb() })
    expect(fullRes.status).toBe(413)

    const spare = fakeR2({
      'kanban/default/theirs.bin': { body: 'x', mime: 'application/octet-stream', userId: 'user-2', size: LIMITS.attachmentQuotaBytesR2 },
    })
    const spareRes = await postUpload(buildTestApp(spare).app, { FILES: spare, DB: fakeDb() })
    expect(spareRes.status).toBe(200)
  })
})
