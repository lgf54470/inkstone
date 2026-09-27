import { describe, expect, it } from 'vitest'
import { GDS_UPSTREAM_SOURCES } from '@shared/constants'
import { isProviderSource } from './provider'

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
