import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../src/worker/env'
import { registerSecurityHeaders } from '../src/worker/middleware/security-headers'

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
