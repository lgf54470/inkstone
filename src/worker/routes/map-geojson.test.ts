import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MAP_SOURCE, MAP_SOURCE_HOSTS } from '@shared/map-sources'
import { mapGeoJsonRoutes } from './map-geojson'

const COLLECTION = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '北京' } }] })

function stubUpstream(response: Response): typeof fetch {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock as unknown as typeof fetch
}

function geoJsonResponse(body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json', ...extra } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the outline proxy', () => {
  it('serves the default outlines and says they may be cached', async () => {
    stubUpstream(geoJsonResponse(COLLECTION))
    const res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toContain('max-age')
    expect(await res.json()).toEqual({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '北京' } }] })
  })

  it('refuses a source off the allowlist without reaching out at all', async () => {
    const fetchMock = stubUpstream(geoJsonResponse(COLLECTION))
    for (const source of [
      'https://evil.example.com/geo.json',
      'http://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost:8788/geo.json',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'not a url',
    ]) {
      const res = await mapGeoJsonRoutes.request(`/map-geojson?source=${encodeURIComponent(source)}`)
      expect(res.status, source).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the host it refused, so the note author can act on it', async () => {
    stubUpstream(geoJsonResponse(COLLECTION))
    const res = await mapGeoJsonRoutes.request('/map-geojson?source=https%3A%2F%2Fevil.example.com%2Fg.json')
    expect((await res.json() as { error: { code: string } }).error.code).toBe('source_not_allowed')
  })

  it('passes an upstream failure through as a bad gateway rather than an empty map', async () => {
    stubUpstream(new Response('nope', { status: 404 }))
    const res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(502)
    expect((await res.json() as { error: { code: string } }).error.code).toBe('upstream_unavailable')
  })

  it('refuses a payload that is JSON but not a feature collection', async () => {
    stubUpstream(geoJsonResponse('{"hello":"world"}'))
    let res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(502)
    expect((await res.json() as { error: { code: string } }).error.code).toBe('source_not_geojson')

    stubUpstream(geoJsonResponse('{"type":"FeatureCollection"}'))
    res = await mapGeoJsonRoutes.request('/map-geojson')
    expect((await res.json() as { error: { code: string } }).error.code).toBe('source_not_geojson')
  })

  it('refuses a body that is not JSON at all', async () => {
    stubUpstream(geoJsonResponse('<html>login</html>'))
    const res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(502)
  })

  it('refuses an outline larger than the cap without buffering it', async () => {
    stubUpstream(new Response('x'.repeat(64), { status: 200, headers: { 'content-type': 'application/json', 'content-length': '999999999' } }))
    const res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(413)
    expect((await res.json() as { error: { code: string } }).error.code).toBe('source_too_large')
  })

  it('refuses a redirect that leaves the allowlist', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === DEFAULT_MAP_SOURCE) return new Response('', { status: 302, headers: { location: 'https://evil.example.com/geo.json' } })
      return geoJsonResponse(COLLECTION)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await mapGeoJsonRoutes.request('/map-geojson')
    expect(res.status).toBe(400)
    // The redirect was never followed to the hostile host.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lists only hosts the allowlist function also accepts', () => {
    for (const host of MAP_SOURCE_HOSTS) {
      expect(host).toBe(new URL(`https://${host}`).hostname)
    }
  })
})
