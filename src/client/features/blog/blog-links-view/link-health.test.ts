import { describe, expect, it } from 'vitest'
import type { BlogLink } from '@shared/types'
import { CACHE_TTL_MS, computeStats, isCacheStale, type HealthResult } from './use-link-checker'

function link(id: string, url: string): BlogLink {
  return { id, url, name: url, description: '', avatar: '', categoryId: null, status: 'approved', isPinned: false, pinnedOrder: 0, isFavorite: false, sortOrder: 0, isActive: true, clicks: 0, createdAt: 0, updatedAt: 0 }
}

const result = (level: HealthResult['level']): HealthResult => ({ status: null, ok: false, level, durationMs: 1 })

/**
 * A request that never reached the site and a site that answered "gone" are different findings, and
 * the checker used to record both as broken — which the bulk delete then acted on. The cache had the
 * same problem in the other direction: it was read without its timestamp, so a verdict from months
 * ago was shown as current.
 */
describe('blog link health', () => {
  it('counts a failed request apart from a broken link', () => {
    const links = [link('a', 'https://a.example.com'), link('b', 'https://b.example.com'), link('c', 'https://c.example.com')]
    const stats = computeStats(links, {
      'https://a.example.com': result('broken'),
      'https://b.example.com': result('error'),
    })
    expect(stats).toEqual({ ok: 0, warning: 0, broken: 1, error: 1, unchecked: 1 })
  })

  it('treats a stored result older than the TTL as stale', () => {
    const now = 1_800_000_000_000
    expect(isCacheStale(now - 60_000, now)).toBe(false)
    expect(isCacheStale(now - CACHE_TTL_MS + 1, now)).toBe(false)
    expect(isCacheStale(now - CACHE_TTL_MS - 1, now)).toBe(true)
    // A cache written by an older version carries no timestamp, and an unreadable age is not a
    // reason to call it fresh.
    expect(isCacheStale(undefined, now)).toBe(true)
  })
})
