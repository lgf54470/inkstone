import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../i18n'
import { destroyEchartsInstances, renderEcharts } from './enhance'
import { stubElementSize } from './enhance.test-helpers'
import { createFenceBodies, registerFenceBodies, takeFenceIndex } from './fence-bodies'
import { renderMarkdown } from './renderer'

/**
 * A map that writes itself as an option body names the geometry its series draws (`map: 'china'`), and
 * the outlines the block fetches have to answer to *that* name. Register them under any other and the
 * note asks for a map nobody handed the library, which reads as a blank picture rather than a mistake —
 * so that is the thing worth pinning here, at the seam the preview actually runs through.
 *
 * The route is stubbed because the outlines come from the app's own proxy, and the box is stubbed because
 * jsdom lays nothing out: an echarts map projects its bounds into the size it measures. Whether the
 * picture is *right* is the visual gate's business; this asks what a block fetched, what it registered,
 * and what it blamed when a step failed.
 */

beforeAll(async () => {
  await initI18n()
})

const SHANGHAI = 'https://geo.datav.aliyun.com/areas_v3/bound/310000_full.json'
const GEOMETRY = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: '北京', cp: [116.4, 39.9] },
    geometry: { type: 'Polygon', coordinates: [[[116, 39], [117, 39], [117, 40.5], [116, 40.5], [116, 39]]] },
  }],
}
const OPTION_MAP = "{ series: [{ type: 'map', map: 'china', data: [{ name: '北京', value: 1 }] }] }"

interface Outcome {
  urls: string[]
  error: string
  drew: boolean
  /** What the library itself complained about, which is where a missing map registration shows up. */
  logged: string
}

/** One body drawn against a stubbed outline route, with everything the assertions need read back off it. */
async function draw(body: string, respond: () => unknown): Promise<Outcome> {
  const originalFetch = globalThis.fetch
  const restoreSize = stubElementSize()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const urls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    const value = respond()
    return { ok: value !== false, status: value === false ? 502 : 200, text: async () => JSON.stringify(value) }
  }) as never
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'echarts', body)
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown('```echarts\n' + body + '\n```').html
  registerFenceBodies(root, fences)
  document.body.append(root)
  try {
    await renderEcharts(root, { allowScript: false, dark: false, instant: false })
    return {
      urls,
      error: root.querySelector('.chart-error-text')?.textContent ?? '',
      drew: Boolean(root.querySelector('[data-echarts] svg')),
      logged: errors.mock.calls.map((call) => String(call[0])).join(' '),
    }
  }
  finally {
    globalThis.fetch = originalFetch
    restoreSize()
    errors.mockRestore()
    destroyEchartsInstances(root)
    root.remove()
  }
}

describe('an echarts map written as an option body', () => {
  it('fetches its outlines through the app’s own route', async () => {
    const run = await draw(OPTION_MAP, () => GEOMETRY)
    expect(run.urls).toHaveLength(1)
    expect(run.urls[0]).toMatch(/^\/api\/map-geojson\?source=https%3A%2F%2Fgeo\.datav\.aliyun\.com/)
    expect(run.error).toBe('')
  })

  // The library says this out loud when a series asks for a map nobody registered, which is exactly what
  // handing the geometry back under a fixed name would produce.
  it('registers them under the name the note used, not a name of the app’s own', async () => {
    const run = await draw(OPTION_MAP, () => GEOMETRY)
    expect(run.drew).toBe(true)
    expect(run.logged).not.toMatch(/not exists/i)
  })

  it('asks for nothing when the body holds no map series', async () => {
    const run = await draw("{ xAxis: { type: 'category', data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }", () => GEOMETRY)
    expect(run.urls).toEqual([])
    expect(run.error).toBe('')
  })
})

describe('what an echarts map blames', () => {
  // A distinct source per case, because outlines are fetched once per URL for the session and a shared
  // URL would hand a later case the geometry an earlier one cached.
  it('blames the outlines when the route cannot answer', async () => {
    const run = await draw(`{ mapDataSource: '${SHANGHAI}', series: [{ type: 'map', map: 'shanghai' }] }`, () => false)
    expect(run.urls).toHaveLength(1)
    expect(run.urls[0]).toContain(encodeURIComponent(SHANGHAI))
    expect(run.error).toContain('Failed to load the map outlines')
  })

  // An empty outline file arrives fine and then has nothing to project, so the drawing is what fails.
  // Blaming the route for that would send the reader to the network over a problem in the data.
  it('does not blame the outline route when the drawing is what fails', async () => {
    const run = await draw(`{ mapDataSource: '${SHANGHAI}', series: [{ type: 'map', map: 'empty' }] }`, () => ({ type: 'FeatureCollection', features: [] }))
    expect(run.urls).toHaveLength(1)
    expect(run.error).not.toContain('Failed to load the map outlines')
  })

  it('refuses a source off the allowlist before asking for it', async () => {
    const run = await draw("{ mapDataSource: 'http://10.0.0.8/geo.json', series: [{ type: 'map', map: 'intranet' }] }", () => GEOMETRY)
    expect(run.urls).toEqual([])
    expect(run.error).toContain('allowed https source')
  })
})
