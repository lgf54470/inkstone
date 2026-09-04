import type { ShareTimelineRange } from '@shared/types'

export function parseDeviceType(ua: string): string {
  if (!ua) return 'desktop'
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  if (/Mobile|Android.*Mobile|iPhone|iPod/i.test(ua)) return 'mobile'
  if (/Android/i.test(ua)) return 'tablet'
  return 'desktop'
}

export function parseOS(ua: string): string {
  if (!ua) return 'Other'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Other'
}

const BOT_PATTERNS = new RegExp(
  [
    'bot\\b',
    'crawl',
    'spider',
    'slurp',
    'googlebot',
    'bingbot',
    'baiduspider',
    'yandexbot',
    'duckduckbot',
    'sogou',
    'bytespider',
    'yisouspider',
    'semrush',
    'ahrefs',
    'dotbot',
    'petalbot',
    'facebookexternalhit',
    'twitterbot',
    'slackbot',
    'discordbot',
    'telegrambot',
    'mediapartners',
    'embedly',
    'feedfetcher',
    'whatsapp',
    'skypeuri',
    'preview',
    'curl/',
    'wget/',
    'python-requests',
    'python-urllib',
    'go-http-client',
    'java/',
    'okhttp',
    'axios/',
    'node-fetch',
    'httpclient',
    'scrapy',
    'aiohttp',
    'libwww',
    'headlesschrome',
    'puppeteer',
    'phantomjs',
    'selenium',
    'playwright',
    'lighthouse',
    'pagespeed',
  ].join('|'),
  'i',
)

export function isBot(ua: string): boolean {
  if (!ua || ua.trim() === '') return true
  return BOT_PATTERNS.test(ua)
}

export function parseBotName(ua: string): string | null {
  if (!ua || ua.trim() === '') return 'Empty UA'
  if (/googlebot/i.test(ua)) return 'Googlebot'
  if (/bingbot/i.test(ua)) return 'Bingbot'
  if (/baiduspider/i.test(ua)) return 'Baiduspider'
  if (/bytespider/i.test(ua)) return 'ByteSpider'
  if (/sogou/i.test(ua)) return 'Sogou'
  if (/yisou/i.test(ua)) return 'YisouSpider'
  if (/yandex/i.test(ua)) return 'YandexBot'
  if (/duckduck/i.test(ua)) return 'DuckDuckBot'
  if (/telegrambot/i.test(ua)) return 'TelegramBot'
  if (/twitterbot/i.test(ua)) return 'TwitterBot'
  if (/facebookexternalhit/i.test(ua)) return 'FacebookBot'
  if (/slackbot/i.test(ua)) return 'Slackbot'
  if (/discordbot/i.test(ua)) return 'DiscordBot'
  if (/curl\//i.test(ua)) return 'cURL'
  if (/wget\//i.test(ua)) return 'Wget'
  if (/python/i.test(ua)) return 'Python'
  if (/go-http-client/i.test(ua)) return 'Go-Client'
  if (/headlesschrome/i.test(ua)) return 'HeadlessChrome'
  if (/puppeteer/i.test(ua)) return 'Puppeteer'
  if (/playwright/i.test(ua)) return 'Playwright'
  if (/spider|crawler|crawl/i.test(ua)) return 'Crawler'
  if (isBot(ua)) return 'Bot'
  return null
}

export interface ShareFilterOptions {
  excludeBots?: boolean
  excludeSelfReferrers?: boolean
  excludeOwner?: boolean
}

export function buildVisitFilterSql(filters: ShareFilterOptions, alias = ''): string {
  const prefix = alias ? `${alias}.` : ''
  const parts: string[] = []
  if (filters.excludeBots !== false) parts.push(`${prefix}is_bot = 0`)
  if (filters.excludeSelfReferrers === true) parts.push(`${prefix}is_self_referrer = 0`)
  if (filters.excludeOwner === true) parts.push(`${prefix}is_owner = 0`)
  return parts.length ? ` AND ${parts.join(' AND ')}` : ''
}

export function parseBrowser(ua: string): string {
  if (!ua) return 'Other'
  if (/EdgA?\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/YaBrowser\//.test(ua)) return 'Yandex'
  if (/Brave/.test(ua)) return 'Brave'
  if (/Vivaldi\//.test(ua)) return 'Vivaldi'
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome'
  if (/Chromium\//.test(ua)) return 'Chromium'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/MSIE|Trident/.test(ua)) return 'IE'
  return 'Other'
}

export const APP_PACKAGE_TO_DOMAIN: Record<string, string> = {
  'com.linkedin.android': 'linkedin.com',
  'com.twitter.android': 'x.com',
  'com.facebook.katana': 'facebook.com',
  'com.facebook.lite': 'facebook.com',
  'com.instagram.android': 'instagram.com',
  'com.zhiliaoapp.musically': 'tiktok.com',
  'com.ss.android.ugc.trill': 'tiktok.com',
  'com.reddit.frontpage': 'reddit.com',
  'com.pinterest': 'pinterest.com',
  'com.Slack': 'slack.com',
  'com.discord': 'discord.com',
  'org.telegram.messenger': 'telegram.org',
  'com.whatsapp': 'whatsapp.com',
  'com.google.android.youtube': 'youtube.com',
  'com.google.android.gm': 'gmail.com',
  'com.microsoft.office.outlook': 'outlook.com',
}

const APP_SCHEME_PREFIXES = ['android-app://', 'ios-app://'] as const

export function normalizeHost(host: string): string {
  let lower = host.toLowerCase().trim()
  if (lower.startsWith('www.')) lower = lower.slice(4)
  const colonIndex = lower.indexOf(':')
  if (colonIndex !== -1) lower = lower.slice(0, colonIndex)
  return lower
}

export function parseAppReferrer(rawReferrer: string): { packageName: string } | null {
  for (const prefix of APP_SCHEME_PREFIXES) {
    if (rawReferrer.startsWith(prefix)) {
      const rest = rawReferrer.slice(prefix.length)
      const pkg = rest.split('/')[0]
      return pkg ? { packageName: pkg } : null
    }
  }
  return null
}

export function parseReferrerHost(rawReferrer: string | null): string | null {
  if (!rawReferrer) return null
  const app = parseAppReferrer(rawReferrer)
  if (app) return APP_PACKAGE_TO_DOMAIN[app.packageName] ?? null
  try {
    return normalizeHost(new URL(rawReferrer).hostname)
  } catch {
    return null
  }
}

export function isSelfReferrer(rawReferrer: string | null, requestHost: string, currentSlug?: string): boolean {
  if (!rawReferrer) return false
  try {
    const u = new URL(rawReferrer)
    const host = normalizeHost(requestHost)
    const isSameHost = normalizeHost(u.hostname) === host || normalizeHost(u.host) === host
    if (!isSameHost) return false
    if (currentSlug && (u.pathname === `/s/${currentSlug}` || u.pathname === `/s/${currentSlug}/`)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, '0')
  }
  return out
}

function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function computeVisitorFingerprint(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
  serverSecret?: string | null,
  now: Date = new Date(),
): Promise<string | null> {
  const ipStr = (ip ?? '').trim()
  const uaStr = (userAgent ?? '').trim()
  if (ipStr.length === 0 && uaStr.length === 0) return null

  const dateKey = utcDateKey(now)
  let salt: string
  if (!serverSecret) {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`inkstone-default-salt:${dateKey}`))
    salt = toHex(digest)
  } else {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(serverSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dateKey))
    salt = toHex(sig)
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${ipStr}|${uaStr}|${salt}`))
  return toHex(digest).slice(0, 32)
}

const RESERVED_SLUGS = new Set([
  'api',
  's',
  'assets',
  'static',
  'auth',
  'settings',
  'admin',
  'dashboard',
  'files',
  'null',
  'undefined',
  'login',
  'logout',
])

export function isValidCustomSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false
  const trimmed = slug.trim()
  if (trimmed.length < 3 || trimmed.length > 64) return false
  if (RESERVED_SLUGS.has(trimmed.toLowerCase())) return false
  return /^[a-zA-Z0-9_-]+$/.test(trimmed)
}

export function computeDelta(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

export function getRangeStartTimestamp(range: ShareTimelineRange, now: number): number {
  if (range === '24h') return now - 24 * 60 * 60 * 1000
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000
  return 0
}
