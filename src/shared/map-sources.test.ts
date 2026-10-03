import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_SOURCE, isAllowedMapSource, MAP_SOURCE_HOSTS } from './map-sources'

describe('the map source allowlist', () => {
  it('accepts its own default', () => {
    expect(isAllowedMapSource(DEFAULT_MAP_SOURCE)).toBe(true)
  })

  it('refuses everything that is not https on a listed host', () => {
    for (const raw of [
      'http://geo.datav.aliyun.com/a.json',
      'https://evil.example.com/a.json',
      'https://localhost:8788/a.json',
      'https://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'geo.datav.aliyun.com/a.json',
      '',
      '   ',
    ]) {
      expect(isAllowedMapSource(raw), raw).toBe(false)
    }
  })

  it('lists only hosts it would be safe to widen connect-src for', () => {
    for (const host of MAP_SOURCE_HOSTS) {
      expect(host).toBe(new URL(`https://${host}`).hostname)
    }
  })
})
