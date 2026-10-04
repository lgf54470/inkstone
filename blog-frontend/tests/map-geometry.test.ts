import { describe, expect, it, vi } from 'vitest'
import { getMapGeometry, mapGeometryUrl } from '../src/lib/map-geometry.ts'
import { DEFAULT_MAP_SOURCE } from '../src/lib/chart/map-sources.ts'

/**
 * The outline route, judged as a boundary rather than as a proxy: what it refuses before any request,
 * what a redirect may and may not reach, and what it will not hand to a browser as "geometry".
 *
 * Every case injects its own fetch, so a refusal is proven by the absence of a call rather than by a
 * comment about one.
 */

const COLLECTION = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '北京' }, geometry: { type: 'Point', coordinates: [0, 0] } }] }

function json(bytes: number = 0, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (bytes) headers.set('content-length', String(bytes))
  return new Response(JSON.stringify(COLLECTION), { ...init, headers })
}

function callsOf(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls.map((call) => String(call[0]))
}

describe('GET /map-geojson', () => {
  it('names the source it will be asked for, encoded', () => {
    expect(mapGeometryUrl('https://geo.datav.aliyun.com/areas_v3/bound/310000_full.json'))
      .toBe('/map-geojson?source=https%3A%2F%2Fgeo.datav.aliyun.com%2Fareas_v3%2Fbound%2F310000_full.json')
  })

  it('refuses a source off the list before any request leaves', async () => {
    const fetchImpl = vi.fn()
    const response = await getMapGeometry(new URLSearchParams({ source: 'http://10.0.0.8/geo.json' }), fetchImpl as never)
    expect(response.status).toBe(400)
    expect(await (await response.json()).error.code).toBe('source_not_allowed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses an http source even on a listed host, and reads the default when none is named', async () => {
    const refused = await getMapGeometry(new URLSearchParams({ source: 'http://geo.datav.aliyun.com/a.json' }), vi.fn() as never)
    expect(refused.status).toBe(400)
    const fetched = vi.fn(async () => json())
    const defaulted = await getMapGeometry(new URLSearchParams(), fetched as never)
    expect(defaulted.status).toBe(200)
    expect(callsOf(fetched)).toEqual([DEFAULT_MAP_SOURCE])
  })

  it('follows a redirect only while every hop is a host the list names', async () => {
    const hop = new Response(null, { status: 302, headers: { location: 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json' } })
    Object.defineProperty(hop, 'url', { value: DEFAULT_MAP_SOURCE })
    const fetched = vi.fn()
      .mockResolvedValueOnce(hop)
      .mockResolvedValueOnce(json())
    const response = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), fetched as never)
    expect(response.status).toBe(200)
    expect(callsOf(fetched)).toEqual([DEFAULT_MAP_SOURCE, 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'])
  })

  it('refuses a redirect off the list without following it', async () => {
    const hop = new Response(null, { status: 301, headers: { location: 'http://169.254.169.4/latest/meta-data' } })
    Object.defineProperty(hop, 'url', { value: DEFAULT_MAP_SOURCE })
    const fetched = vi.fn(async () => hop)
    const response = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), fetched as never)
    expect(response.status).toBe(400)
    expect(callsOf(fetched)).toEqual([DEFAULT_MAP_SOURCE])
  })

  it('relays an upstream failure as a gateway error, and a too-large body as a refusal', async () => {
    const down = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), vi.fn(async () => new Response('', { status: 503 })) as never)
    expect(down.status).toBe(502)
    const huge = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), vi.fn(async () => json(9_000_000)) as never)
    expect(huge.status).toBe(413)
    expect(await (await huge.json()).error.code).toBe('source_too_large')
  })

  // A host may answer in chunks with no length announced, which is what the cap is really for: the
  // declared-size check above cannot see it coming.
  it('stops reading a chunked body that outgrows the cap', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 6; index++) controller.enqueue(chunk)
        controller.close()
      },
    })
    const endless = new Response(stream as never)
    const response = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), vi.fn(async () => endless) as never)
    expect(response.status).toBe(413)
    expect(await (await response.json()).error.code).toBe('source_too_large')
  })

  it('will not answer with anything that is not a feature collection', async () => {
    const notJson = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), vi.fn(async () => new Response('<html>')) as never)
    expect(notJson.status).toBe(502)
    expect(await (await notJson.json()).error.code).toBe('source_not_geojson')
    const wrongShape = await getMapGeometry(
      new URLSearchParams({ source: DEFAULT_MAP_SOURCE }),
      vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection' }))) as never,
    )
    expect(wrongShape.status).toBe(502)
  })

  it('caches a good answer publicly for a day, and never caches a refusal', async () => {
    const ok = await getMapGeometry(new URLSearchParams({ source: DEFAULT_MAP_SOURCE }), vi.fn(async () => json()) as never)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(ok.headers.get('content-type')).toContain('application/json')
    expect(await ok.json()).toEqual(COLLECTION)
    const refused = await getMapGeometry(new URLSearchParams({ source: 'https://elsewhere.example/x.json' }), vi.fn() as never)
    expect(refused.headers.get('cache-control')).toBe('no-store')
  })
})
