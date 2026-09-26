import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../music-store/state'
import { listProviders } from './index'

describe('provider registry (FEA-A1-1)', () => {
  it('registers the aggregate provider and ships every provider disabled', () => {
    const providers = listProviders()
    expect(providers.map((provider) => provider.id)).toEqual(['gds'])
    expect(DEFAULT_PREFERENCES.providerEnabled).toEqual({})
    expect(providers[0]?.isEnabled(DEFAULT_PREFERENCES)).toBe(false)
  })

  it('reads enabled state from the preference map only', () => {
    const prefs = { ...DEFAULT_PREFERENCES, providerEnabled: { gds: true } }
    expect(listProviders()[0]?.isEnabled(prefs)).toBe(true)
  })
})
