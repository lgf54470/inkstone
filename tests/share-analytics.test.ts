import { describe, expect, it } from 'vitest'
import {
  buildVisitFilterSql,
  computeDelta,
  computeVisitorFingerprint,
  isBot,
  isSelfReferrer,
  isValidCustomSlug,
  normalizeHost,
  parseBotName,
  parseBrowser,
  parseDeviceType,
  parseOS,
  parseReferrerHost,
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
  it('validates 3-64 character alphanumeric, hyphens, and underscores', () => {
    expect(isValidCustomSlug('my-custom-note')).toBe(true)
    expect(isValidCustomSlug('Project_2026')).toBe(true)
    expect(isValidCustomSlug('doc')).toBe(true)
    expect(isValidCustomSlug('a'.repeat(64))).toBe(true)
  })

  it('rejects invalid slug lengths and illegal characters', () => {
    expect(isValidCustomSlug('no')).toBe(false) // too short (< 3)
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
    expect(computeDelta(0, 0)).toBe(0)
  })

  it('formats country flags from 2-letter codes', () => {
    expect(countryFlag('US')).toBe('🇺🇸')
    expect(countryFlag('CN')).toBe('🇨🇳')
    expect(countryFlag('JP')).toBe('🇯🇵')
    expect(countryFlag('UNKNOWN')).toBe('🌐')
    expect(countryFlag(null)).toBe('🌐')
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
