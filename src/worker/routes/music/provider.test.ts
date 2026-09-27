import { afterEach, describe, expect, it, vi } from 'vitest'
import { GDS_UPSTREAM_SOURCES, MUSIC_PROVIDER_QUALITIES } from '@shared/constants'
import { fetchProviderUpstream, isProviderSource, readProviderQuality } from './provider'

afterEach(() => {
  vi.unstubAllGlobals()
})

// FB-S4: the proxy is the trust boundary for the catalogue name — it is what turns a path segment
// into an upstream request — so the set it accepts is the half of this contract that matters. The
// list itself lives in one place now; these two cases pin the worker to it from the outside, which
// is what a re-introduced literal on this side would break.
describe('the proxy forwards every catalogue the client offers (FB-S4)', () => {
  it('accepts each shared catalogue name', () => {
    for (const source of GDS_UPSTREAM_SOURCES) expect(isProviderSource(source)).toBe(true)
  })

  it('refuses anything else, case and whitespace included', () => {
    for (const name of ['spotify', 'netease ', ' netease', 'NETEASE', 'kuwoo', '', '..', 'netease/../x']) {
      expect(isProviderSource(name)).toBe(false)
    }
  })
})

// FB-S2: the catalogue proxy walks the same hop-by-hop allowlist every other outbound walk in the
// worker answers to — a redirect the worker follows is the worker fetching, so a hop that leaves
// the catalogue's host (or lands on a private address) is refused, not followed.
describe('the catalogue proxy checks every hop (FB-S2)', () => {
  function stubRedirect(location: string): string[] {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response(null, { status: 302, headers: { Location: location } })
    }))
    return seen
  }

  it('refuses a redirect that leaves the allowed host', async () => {
    const seen = stubRedirect('https://evil.example.com/api.php')
    await expect(fetchProviderUpstream('https://music-api.gdstudio.xyz/api.php?types=search')).rejects.toThrow()
    expect(seen.some((url) => url.includes('evil.example.com'))).toBe(false)
  })

  it('refuses a redirect onto a private address', async () => {
    const seen = stubRedirect('http://192.168.1.5/api.php')
    await expect(fetchProviderUpstream('https://music-api.gdstudio.xyz/api.php?types=search')).rejects.toThrow()
    expect(seen.some((url) => url.includes('192.168.1.5'))).toBe(false)
  })
})

// FB-F7: the tier travels as a query parameter, and it is the worker that has to hold the
// whitelist — the client's preference is stored state, not a trust boundary.
describe('the online quality tier (FB-F7)', () => {
  it('defaults when the request carries no tier', () => {
    expect(readProviderQuality(undefined)).toBe(320)
    expect(readProviderQuality('')).toBe(320)
  })

  it('accepts every tier the setting offers', () => {
    for (const tier of MUSIC_PROVIDER_QUALITIES) expect(readProviderQuality(String(tier))).toBe(tier)
  })

  it('refuses anything else rather than quietly downgrading', () => {
    for (const value of ['0', '256', '128.5', 'abc', '999 kbps', '-128']) {
      expect(() => readProviderQuality(value)).toThrow()
    }
  })
})
