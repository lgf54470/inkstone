import { describe, expect, it } from 'vitest'
import {
  FILTERED_STATS_TTL_MS,
  filteredStatsCacheKey,
  parseFilteredStatsCache,
  serializeFilteredStatsCache,
} from '../src/worker/routes/share/global-stats'
import type { FilteredStatsRow } from '../src/worker/routes/share/global-stats'

const NOW = 1_700_000_000_000
const VALUE: FilteredStatsRow = { total_views: 12, total_uv: 5 }

describe('filtered stats memo (audit #15)', () => {
  it('round-trips a fresh entry', () => {
    const raw = serializeFilteredStatsCache(VALUE, NOW)
    expect(parseFilteredStatsCache(raw, NOW + 1_000)).toEqual(VALUE)
  })

  it('expires exactly at the window edge', () => {
    const raw = serializeFilteredStatsCache(VALUE, NOW)
    expect(parseFilteredStatsCache(raw, NOW + FILTERED_STATS_TTL_MS - 1)).toEqual(VALUE)
    expect(parseFilteredStatsCache(raw, NOW + FILTERED_STATS_TTL_MS)).toBeNull()
  })

  it('treats a clock that has not reached the stamp as a miss', () => {
    const raw = serializeFilteredStatsCache(VALUE, NOW)
    expect(parseFilteredStatsCache(raw, NOW - 1)).toBeNull()
  })

  it('reads corrupt or mis-shaped rows as a miss instead of throwing', () => {
    expect(parseFilteredStatsCache(null, NOW)).toBeNull()
    expect(parseFilteredStatsCache('not json', NOW)).toBeNull()
    expect(parseFilteredStatsCache('{"v":"12","u":5,"at":1}', NOW)).toBeNull()
    expect(parseFilteredStatsCache('{"v":1.5,"u":5,"at":1}', NOW)).toBeNull()
    expect(parseFilteredStatsCache('{"v":12,"u":5}', NOW)).toBeNull()
  })

  it('keys per account and per traffic clause', () => {
    const same = filteredStatsCacheKey('u1', ' AND is_bot = 0')
    expect(filteredStatsCacheKey('u1', ' AND is_bot = 0')).toBe(same)
    expect(filteredStatsCacheKey('u2', ' AND is_bot = 0')).not.toBe(same)
    expect(filteredStatsCacheKey('u1', '')).not.toBe(same)
  })
})
