import { describe, expect, it } from 'vitest'
import {
  analyticsWindow,
  buildBucketedTimeline,
  buildShareTimeline,
  buildVisitFilterSql,
  bucketsFromVisitRows,
  computeDelta,
  computeVisitorFingerprint,
  isBot,
  isSelfReferrer,
  isValidCustomSlug,
  normalizeHost,
  parseAnalyticsRequest,
  parseBotName,
  parseBrowser,
  parseDeviceType,
  parseOS,
  parseReferrerHost,
  perDayRate,
  shareRangeFromQuery,
} from '../src/worker/lib/share-analytics'
import { countryFlag } from '../src/client/features/share/share-helpers'

describe('share-analytics user agent parser', () => {
  it('detects desktop devices', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(parseDeviceType(ua)).toBe('desktop')
    expect(parseOS(ua)).toBe('macOS')
    expect(parseBrowser(ua)).toBe('Chrome')
    expect(isBot(ua)).toBe(false)
  })

  it('detects iPhone mobile devices', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
    expect(parseDeviceType(ua)).toBe('mobile')
    expect(parseOS(ua)).toBe('iOS')
    expect(parseBrowser(ua)).toBe('Safari')
    expect(isBot(ua)).toBe(false)
  })

  it('detects iPad tablet devices', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    expect(parseDeviceType(ua)).toBe('tablet')
    expect(parseOS(ua)).toBe('iOS')
  })

  it('detects Android devices', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36'
    expect(parseDeviceType(ua)).toBe('mobile')
    expect(parseOS(ua)).toBe('Android')
    expect(parseBrowser(ua)).toBe('Chrome')
  })

  it('detects Windows and Edge', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    expect(parseOS(ua)).toBe('Windows')
    expect(parseBrowser(ua)).toBe('Edge')
    expect(parseDeviceType(ua)).toBe('desktop')
  })

  it('detects web crawlers and search bots', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(isBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe(true)
    expect(isBot('Baiduspider+(+http://www.baidu.com/search/spider.htm)')).toBe(true)
    expect(isBot('curl/8.4.0')).toBe(true)
    expect(isBot('python-requests/2.31.0')).toBe(true)
  })
})

describe('referrer parser and self-referral filtering', () => {
  it('normalizes hostnames', () => {
    expect(normalizeHost('www.google.com')).toBe('google.com')
    expect(normalizeHost('google.com:443')).toBe('google.com')
    expect(normalizeHost('SUB.DOMAIN.COM:8080')).toBe('sub.domain.com')
  })

  it('extracts host from referrer url', () => {
    expect(parseReferrerHost('https://github.com/lgf54470/inkstone?ref=readme')).toBe('github.com')
    expect(parseReferrerHost('https://www.twitter.com/post/123')).toBe('twitter.com')
    expect(parseReferrerHost('invalid-url')).toBeNull()
    expect(parseReferrerHost(null)).toBeNull()
  })

  it('identifies self referrals', () => {
    expect(isSelfReferrer('https://inkstone.app/notes/123', 'inkstone.app')).toBe(true)
    expect(isSelfReferrer('https://www.inkstone.app/notes/123', 'inkstone.app')).toBe(true)
    expect(isSelfReferrer('https://inkstone.app:8787/notes/123', 'inkstone.app:8787')).toBe(true)
    expect(isSelfReferrer('https://external-site.com', 'inkstone.app')).toBe(false)
    expect(isSelfReferrer(null, 'inkstone.app')).toBe(false)
  })
})

describe('visitor fingerprinting and privacy hashing', () => {
  it('generates consistent 32-char hex fingerprint on same day', async () => {
    const fp1 = await computeVisitorFingerprint('203.0.113.195', 'Mozilla/5.0 Mac')
    const fp2 = await computeVisitorFingerprint('203.0.113.195', 'Mozilla/5.0 Mac')
    expect(fp1).toHaveLength(32)
    expect(fp1).toBe(fp2)
  })

  it('generates different fingerprints for different IP or user agents', async () => {
    const fp1 = await computeVisitorFingerprint('203.0.113.195', 'Mozilla/5.0 Mac')
    const fp2 = await computeVisitorFingerprint('198.51.100.42', 'Mozilla/5.0 Mac')
    const fp3 = await computeVisitorFingerprint('203.0.113.195', 'Mozilla/5.0 Windows')
    expect(fp1).not.toBe(fp2)
    expect(fp1).not.toBe(fp3)
  })
})

describe('custom slug validation', () => {
  it('validates 6-64 character alphanumeric, hyphens, and underscores', () => {
    expect(isValidCustomSlug('my-custom-note')).toBe(true)
    expect(isValidCustomSlug('Project_2026')).toBe(true)
    expect(isValidCustomSlug('doc-page')).toBe(true)
    expect(isValidCustomSlug('a'.repeat(64))).toBe(true)
  })

  it('rejects invalid slug lengths and illegal characters', () => {
    expect(isValidCustomSlug('doc')).toBe(false) // too short (< 6)
    expect(isValidCustomSlug('abcde')).toBe(false) // just below the 6-char floor
    expect(isValidCustomSlug('a'.repeat(65))).toBe(false) // too long (> 64)
    expect(isValidCustomSlug('my note')).toBe(false) // spaces
    expect(isValidCustomSlug('my/note')).toBe(false) // slashes
    expect(isValidCustomSlug('\u7b14\u8bb0')).toBe(false) // non-ascii
    expect(isValidCustomSlug('note?id=1')).toBe(false) // query symbols
  })
})

describe('analytics math and country flag formatting', () => {
  it('computes delta percentage correctly', () => {
    expect(computeDelta(150, 100)).toBe(50)
    expect(computeDelta(50, 100)).toBe(-50)
    expect(computeDelta(100, 100)).toBe(0)
    expect(computeDelta(50, 0)).toBe(100)
    // A period that never saw traffic has no trend to report: 0/0 is
    // indeterminate, so the server says "no delta" rather than "flat 0%".
    expect(computeDelta(0, 0)).toBeUndefined()
  })

  it('keeps the per-day rate honest on a one-day window (SH-56)', () => {
    // 24h is one day, so the rate must equal the total — but not by rounding to an integer that
    // would then read as "the same number as above" for a 7-day window too.
    expect(perDayRate(300, 1)).toBe(300)
    expect(perDayRate(300, 7)).toBe(42.9)
    expect(perDayRate(0, 7)).toBe(0)
    // A window shorter than a day is still measured per day, never per zero days.
    expect(perDayRate(5, 0)).toBe(5)
  })

  it('formats country flags from 2-letter codes', () => {
    expect(countryFlag('US')).toBe('🇺🇸')
    expect(countryFlag('CN')).toBe('🇨🇳')
    expect(countryFlag('JP')).toBe('🇯🇵')
    expect(countryFlag('UNKNOWN')).toBe('🌐')
    expect(countryFlag(null)).toBe('🌐')
  })
})

describe('analytics request parsing and window math', () => {
  function query(values: Record<string, string>) {
    return { req: { query: (key: string) => values[key] } }
  }

  it('falls back to 7d without a range and 30d for an unknown one', () => {
    expect(shareRangeFromQuery(undefined)).toBe('7d')
    expect(shareRangeFromQuery('24h')).toBe('24h')
    expect(shareRangeFromQuery('all')).toBe('all')
    expect(shareRangeFromQuery('zzz')).toBe('30d')
  })

  it('reads filters from the query with bots excluded by default', () => {
    const parsed = parseAnalyticsRequest(query({ range: '7d' }))
    expect(parsed.range).toBe('7d')
    expect(parsed.filters.excludeBots).toBe(true)
    expect(parsed.clause).toBe(' AND is_bot = 0')
    const relaxed = parseAnalyticsRequest(query({ range: '7d', excludeBots: 'false', excludeSelf: 'true', excludeOwner: 'true' }))
    expect(relaxed.clause).toBe(' AND is_self_referrer = 0 AND is_owner = 0')
  })

  it('scopes the all window to the earliest visit and keeps 30d without one', () => {
    const now = 2_000_000_000_000
    const day = 86_400_000
    expect(analyticsWindow('all', now, now - 10 * day)).toEqual({
      startTs: now - 10 * day,
      duration: 10 * day,
      prevStartTs: now - 20 * day,
    })
    const withoutVisits = analyticsWindow('all', now, null)
    expect(withoutVisits.startTs).toBe(now - 30 * day)
    expect(analyticsWindow('7d', now).startTs).toBe(now - 7 * day)
    expect(analyticsWindow('7d', now).duration).toBe(7 * day)
    expect(analyticsWindow('24h', now).prevStartTs).toBe(now - 48 * 3_600_000)
  })

  it('zero-fills buckets and matches the row path', () => {
    const now = 2_000_000_000_000
    const day = 86_400_000
    const rows = [
      { visited_at: now - 9 * day, visitor_fp: 'before' },
      { visited_at: now - 2 * day, visitor_fp: 'a' },
      { visited_at: now - 2 * day + 1, visitor_fp: 'a' },
      { visited_at: now - day, visitor_fp: null },
      { visited_at: now + day, visitor_fp: 'future' },
    ]
    const window = analyticsWindow('7d', now)
    const buckets = bucketsFromVisitRows(rows, '7d', window.startTs, window.duration)
    expect(buckets.length).toBe(7)
    expect(buckets[5]).toEqual({ views: 2, visitors: 1 })
    expect(buckets[6]).toEqual({ views: 1, visitors: 0 })
    expect(buckets.reduce((sum, b) => sum + b.views, 0)).toBe(3)
    expect(buildBucketedTimeline(buckets, '7d', window.startTs, window.duration)).toEqual(
      buildShareTimeline(rows, '7d', window.startTs, window.duration),
    )
    const sparse = buildBucketedTimeline([], '7d', window.startTs, window.duration)
    expect(sparse.every((p) => p.views === 0 && p.visitors === 0)).toBe(true)
    expect(sparse.map((p) => p.timestamp)).toEqual(sparse.map((_, i) => window.startTs + i * day))
  })
})

describe('bot identification and traffic filter sql generator', () => {
  it('correctly identifies various bots and crawlers', () => {
    expect(parseBotName('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('Googlebot')
    expect(parseBotName('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')).toBe('Bingbot')
    expect(parseBotName('Baiduspider+(+http://www.baidu.com/search/spider.htm)')).toBe('Baiduspider')
    expect(parseBotName('Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)')).toBe('ByteSpider')
    expect(parseBotName('Twitterbot/1.0')).toBe('TwitterBot')
    expect(parseBotName('facebookexternalhit/1.1')).toBe('FacebookBot')
    expect(parseBotName('TelegramBot (like TwitterBot)')).toBe('TelegramBot')
    expect(parseBotName('curl/7.88.1')).toBe('cURL')
    expect(parseBotName('python-requests/2.31.0')).toBe('Python')
    expect(parseBotName('Go-http-client/1.1')).toBe('Go-Client')
    expect(parseBotName('')).toBe('Empty UA')
    expect(parseBotName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(null)
  })

  it('builds correct filter sql based on filter options', () => {
    // Default / All enabled:
    expect(buildVisitFilterSql({ excludeBots: true, excludeSelfReferrers: true, excludeOwner: true })).toBe(
      ' AND is_bot = 0 AND is_self_referrer = 0 AND is_owner = 0',
    )
    // Exclude bots only:
    expect(buildVisitFilterSql({ excludeBots: true, excludeSelfReferrers: false, excludeOwner: false })).toBe(
      ' AND is_bot = 0',
    )
    // All disabled:
    expect(buildVisitFilterSql({ excludeBots: false, excludeSelfReferrers: false, excludeOwner: false })).toBe('')
    // With table alias:
    expect(buildVisitFilterSql({ excludeBots: true, excludeSelfReferrers: true, excludeOwner: false }, 'sv')).toBe(
      ' AND sv.is_bot = 0 AND sv.is_self_referrer = 0',
    )
  })
})
