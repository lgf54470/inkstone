import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { SESSION_COOKIE } from '../src/shared/constants'
import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { hashToken } from '../src/worker/lib/session-store'
import { registerSecurityHeaders } from '../src/worker/middleware/security-headers'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const HTML_BODY = '<html><body><script>boot()</script></body></html>'

class FakeElement {
  private extra = ''
  constructor(private readonly attrs: string) {}
  hasAttribute(name: string): boolean { return new RegExp(`\\b${name}=`, 'i').test(this.attrs + this.extra) }
  setAttribute(name: string, value: string): void { this.extra += ` ${name}="${value}"` }
  render(): string { return `<script${this.attrs}${this.extra}>` }
}

class FakeHtmlRewriter {
  private readonly handlers: ((el: FakeElement) => void)[] = []
  on(_selector: string, handler: { element: (el: FakeElement) => void }): this {
    this.handlers.push((el) => handler.element(el))
    return this
  }
  transform(response: Response): Response {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        response.text().then((text) => {
          controller.enqueue(encoder.encode(text.replace(/<script((?![^>]*\bsrc=)[^>]*)>/gi, (_m, attrs: string) => {
            const element = new FakeElement(attrs)
            for (const handler of this.handlers) handler(element)
            return element.render()
          })))
          controller.close()
        }, (error: unknown) => controller.error(error))
      },
    })
    return new Response(stream, response)
  }
}

vi.stubGlobal('HTMLRewriter', FakeHtmlRewriter)

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  registerSecurityHeaders(app)
  app.get('/api/probe', (c) => c.html(HTML_BODY))
  app.get('/s/probe', (c) => c.html(HTML_BODY))
  app.get('/probe', (c) => c.html(HTML_BODY))
  app.get('/api/json', (c) => c.json({ ok: true }))
  return app
}

async function scriptSourceOf(app: Hono<AppBindings>, path: string): Promise<{ csp: string; body: string }> {
  const res = await app.request(path, {}, {} as AppBindings['Bindings'])
  return { csp: res.headers.get('Content-Security-Policy') ?? '', body: await res.text() }
}

describe('security headers middleware', () => {
  it('never stamps a CSP nonce onto /api/* HTML responses', async () => {
    const { csp, body } = await scriptSourceOf(makeApp(), '/api/probe')
    expect(csp).toContain("script-src 'self';")
    expect(csp).not.toContain('nonce-')
    expect(body).not.toContain('nonce=')
  })

  it('stamps a matching nonce on first-party document HTML', async () => {
    for (const path of ['/s/probe', '/probe']) {
      const { csp, body } = await scriptSourceOf(makeApp(), path)
      const match = csp.match(/script-src 'self' 'nonce-([\w-]+)'/)
      expect(match, path).not.toBeNull()
      expect(body, path).toContain(`nonce="${match![1]}"`)
    }
  })

  it('keeps JSON API responses on plain self script source', async () => {
    const { csp } = await scriptSourceOf(makeApp(), '/api/json')
    expect(csp).toContain("script-src 'self';")
  })
})

describe('external image opt-in is refused on public pages', () => {
  const TOKEN = 'a'.repeat(64)
  const NOW = 2_000_000_000_000

  async function appWithOptedInViewer(): Promise<{
    app: Hono<AppBindings>
    env: AppBindings['Bindings']
    imgSrcOf: (path: string) => Promise<string>
  }> {
    const db = createDb()
    for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
    for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at, settings)
       VALUES (?1, 'listener', 'x', 'listener', 'Listener', '', ?2, ?2, ?3)`,
      'user-1', NOW, JSON.stringify({ preview: { externalImages: true } }),
    )
    await runSql(
      db,
      'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)',
      await hashToken(TOKEN), 'user-1', NOW + 3_600_000, NOW,
    )
    const env = { DB: db as unknown as D1Database } as AppBindings['Bindings']
    const app = new Hono<AppBindings>()
    registerSecurityHeaders(app)
    for (const path of ['/probe', '/s/probe', '/c/probe', '/playlist/probe']) {
      app.get(path, (c) => c.html(HTML_BODY))
    }
    const imgSrcOf = async (path: string): Promise<string> => {
      const res = await app.request(path, { headers: { Cookie: `${SESSION_COOKIE}=${TOKEN}` } }, env)
      return /img-src ([^;]+);/.exec(res.headers.get('Content-Security-Policy') ?? '')?.[1] ?? ''
    }
    return { app, env, imgSrcOf }
  }

  it('adds https: for a signed-in page whose viewer opted in', async () => {
    const { imgSrcOf } = await appWithOptedInViewer()
    expect(await imgSrcOf('/probe')).toContain('https:')
  })

  it('omits https: on the share, collection and playlist shells even when the viewer opted in', async () => {
    const { imgSrcOf } = await appWithOptedInViewer()
    for (const path of ['/s/probe', '/c/probe', '/playlist/probe']) {
      expect(await imgSrcOf(path), path).not.toContain('https:')
    }
  })
})
