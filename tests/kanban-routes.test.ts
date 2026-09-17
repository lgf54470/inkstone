import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { kanbanRoutes } from '../src/worker/routes/kanban'

function fakeR2(initialFiles: Record<string, { body: string; mime: string; userId: string }> = {}) {
  const store = new Map<string, { body: string; mime: string; userId: string }>(Object.entries(initialFiles))

  return {
    put: vi.fn(async (key: string, bytes: Uint8Array, opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => {
      store.set(key, {
        body: new TextDecoder().decode(bytes),
        mime: opts.httpMetadata?.contentType || 'application/octet-stream',
        userId: opts.customMetadata?.userId || '',
      })
      return {}
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
        customMetadata: { userId: found.userId },
        httpMetadata: { contentType: found.mime },
      }
    }),
    head: vi.fn(async (key: string) => {
      const found = store.get(key)
      if (!found) return null
      return {
        size: found.body.length,
        customMetadata: { userId: found.userId },
        httpMetadata: { contentType: found.mime },
      }
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
  }
}

function buildTestApp(r2 = fakeR2(), currentUserId = 'user-1') {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))

  app.use('*', async (c, next) => {
    c.set('userId', currentUserId)
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
})
