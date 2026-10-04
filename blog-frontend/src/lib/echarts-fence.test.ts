// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from './markdown/index'
import { initDiagramLazyRender, rerenderDiagramsForTheme } from './diagram-reveal'

/**
 * A ` ```echarts ` block on a post, drawn by the real library.
 *
 * What is pinned here is the seam the reader runs through: the gallery's dialect is read, a body holding
 * a function is not, an outline comes from this origin, and a source the site does not name is never
 * asked for. Whether the picture is *right* is the browser gate's business.
 */

const ALLOWED = 'https://geo.datav.aliyun.com/areas_v3/bound/310000_full.json'
const GEOMETRY = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'North' },
    geometry: { type: 'Polygon', coordinates: [[[116, 39], [117, 39], [117, 40.5], [116, 40.5], [116, 39]]] },
  }],
}
const BAR = "{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] }"
const MAP = "{ series: [{ type: 'map', map: 'china', data: [{ name: 'North', value: 1 }] }] }"

interface Outcome {
  urls: string[]
  drew: boolean
  banner: string
  logged: string
}

/** echarts lays its bounds into the box it measures, and jsdom lays nothing out at all. */
function stubElementSize(width = 320, height = 200): () => void {
  const descriptor = (value: number) => ({ configurable: true, get: () => value })
  const before = {
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  }
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', descriptor(width))
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', descriptor(height))
  return () => {
    for (const [key, original] of Object.entries(before)) {
      if (original) Object.defineProperty(HTMLElement.prototype, key, original)
      else Reflect.deleteProperty(HTMLElement.prototype, key)
    }
  }
}

/** jsdom reports no layout, and a theme flip only re-queues a block it can see has rects. */
function stubRects(): () => void {
  const before = Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects')
  Object.defineProperty(Element.prototype, 'getClientRects', { configurable: true, value: () => [{}] })
  return () => {
    if (before) Object.defineProperty(Element.prototype, 'getClientRects', before)
    else Reflect.deleteProperty(Element.prototype, 'getClientRects')
  }
}

async function settle(predicate: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => { setTimeout(resolve, 50) })
  }
  return predicate()
}

/** One body drawn against a stubbed outline route, with everything the assertions need read back off it. */
async function draw(body: string, respond: (() => unknown) | 'none' = 'none'): Promise<Outcome> {
  const originalFetch = globalThis.fetch
  const restoreSize = stubElementSize()
  const restoreRects = stubRects()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const urls: string[] = []
  if (respond !== 'none') {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      const value = respond()
      // The refused answer still carries a usable outline behind its status: a block that drew from it
      // would mean the status was never the gate.
      const geometry = value === false ? GEOMETRY : value
      return { ok: value !== false, status: value === false ? 502 : 200, json: async () => geometry }
    }) as never
  }
  const root = document.createElement('div')
  root.className = 'ink-prose'
  root.innerHTML = renderMarkdown(`\`\`\`echarts\n${body}\n\`\`\``).html
  document.body.replaceChildren(root)
  try {
    initDiagramLazyRender()
    const painted = await settle(() => Boolean(root.querySelector('.echarts-block svg'))
      || Boolean(root.querySelector('.chart-error-text')))
    return {
      urls,
      drew: painted && Boolean(root.querySelector('.echarts-block svg')),
      banner: root.querySelector('.chart-error-text')?.textContent ?? '',
      logged: errors.mock.calls.map((call) => String(call[0])).join(' '),
    }
  }
  finally {
    globalThis.fetch = originalFetch
    restoreSize()
    restoreRects()
    errors.mockRestore()
  }
}

beforeEach(() => {
  document.documentElement.lang = 'en-US'
})

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
  document.documentElement.removeAttribute('data-theme')
})

describe('a post drawing an echarts fence', () => {
  it('draws the option the gallery writes', async () => {
    const run = await draw(BAR)
    expect(run.drew).toBe(true)
    expect(run.banner).toBe('')
  })

  it('reads a body that asks for a function as data only, and says so', async () => {
    const before = document.title
    const run = await draw('{ series: [{ itemStyle: { color: (p) => p.data } }] }')
    expect(run.drew).toBe(false)
    expect(run.banner).toContain('JSON5')
    expect(document.title).toBe(before)
  })

  it('fetches a map\'s outlines from this origin, not from the outline host', async () => {
    const run = await draw(MAP, () => GEOMETRY)
    expect(run.urls).toHaveLength(1)
    expect(run.urls[0]!.startsWith('/map-geojson?source=')).toBe(true)
    // The claim is about where the *browser* goes: a relative URL is answered by this origin, and the
    // outline host is contacted by the Worker instead, so the reader's own address never leaves for it.
    expect(run.urls[0]).not.toMatch(/^https?:/)
    expect(run.drew).toBe(true)
    // Registered under the name the note's own series asked for, which is what lets a copied example draw.
    expect(run.logged).not.toContain('not exists')
  })

  it('refuses an outline source the site does not name, without contacting it', async () => {
    const run = await draw(`{ mapDataSource: 'https://evil.example.com/g.json', series: [{ type: 'map', map: 'china' }] }`, () => GEOMETRY)
    expect(run.urls).toHaveLength(0)
    expect(run.drew).toBe(false)
    expect(run.banner).toContain('allowed https source')
  })

  it('names the default outline file a map with no source of its own needs', async () => {
    const run = await draw(MAP, () => GEOMETRY)
    expect(run.urls[0]).toContain(encodeURIComponent(ALLOWED.slice(0, ALLOWED.lastIndexOf('/'))))
  })
})

describe('a map whose outlines do not come', () => {
  it('blames the route when it answers with a failure', async () => {
    const run = await draw(MAP, () => false)
    expect(run.drew).toBe(false)
    expect(run.banner).toContain('map outlines')
  })

  it('blames the route when the answer is not outline geometry', async () => {
    const run = await draw(MAP, () => ({ type: 'Feature', features: [] }))
    expect(run.drew).toBe(false)
    expect(run.banner).toContain('map outlines')
  })
})

describe('a drawn echarts block following the page', () => {
  it('repaints for the theme it is showing', async () => {
    const restoreSize = stubElementSize()
    const restoreRects = stubRects()
    const root = document.createElement('div')
    root.className = 'ink-prose'
    root.innerHTML = renderMarkdown(`\`\`\`echarts\n${BAR}\n\`\`\``).html
    document.body.replaceChildren(root)
    try {
      initDiagramLazyRender()
      await settle(() => Boolean(root.querySelector('.echarts-block svg')))
      const first = root.querySelector('.echarts-block svg')
      document.documentElement.setAttribute('data-theme', 'dark')
      rerenderDiagramsForTheme()
      expect(await settle(() => root.querySelector('.echarts-block svg') !== first)).toBe(true)
      expect(root.querySelector('.echarts-block svg')).not.toBeNull()
    }
    finally {
      restoreRects()
      restoreSize()
    }
  })
})
