import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type BlogLocale,
  type InterpolationParams,
  type MessageKey,
} from './types'
import { ZH_CN_MESSAGES } from './locales/zh-CN'
import { ZH_TW_MESSAGES } from './locales/zh-TW'
import { EN_US_MESSAGES } from './locales/en-US'

export * from './types'
export { useCurrentLocale } from './use-current-locale'

const MESSAGES: Record<BlogLocale, Record<MessageKey, string>> = {
  'zh-CN': ZH_CN_MESSAGES,
  'zh-TW': ZH_TW_MESSAGES,
  'en-US': EN_US_MESSAGES,
}

export function getCurrentLocale(): BlogLocale {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.getAttribute('lang')
    if (isSupportedLocale(lang)) return lang
  }
  return DEFAULT_LOCALE
}

export function t(key: MessageKey, params?: InterpolationParams, locale: BlogLocale = DEFAULT_LOCALE): string {
  const dict = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE]
  const template = dict[key] || MESSAGES[DEFAULT_LOCALE][key] || key
  if (!params) return template
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const val = params[name]
    return val !== undefined ? String(val) : match
  })
}

export function formatDate(
  date: Date | string | number,
  locale: BlogLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  return d.toLocaleDateString(locale, options || defaultOptions)
}

export function formatMonthYear(year: number, month: number, locale: BlogLocale = DEFAULT_LOCALE): string {
  const d = new Date(year, month - 1, 1)
  if (locale === 'en-US') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  }
  return `${year}年 ${month}月`
}

export function formatMonthDay(date: Date | string | number, locale: BlogLocale = DEFAULT_LOCALE): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, {
    month: '2-digit',
    day: '2-digit',
  })
}

export function resolveLocale(
  cookie?: string | null,
  acceptLanguage?: string | null,
  queryLang?: string | null
): BlogLocale {
  // 1. Query parameter override
  if (queryLang && isSupportedLocale(queryLang)) {
    return queryLang
  }

  // 2. Cookie preference
  if (cookie && isSupportedLocale(cookie)) {
    return cookie
  }

  // 3. Accept-Language header matching
  if (acceptLanguage) {
    const matched = parseAcceptLanguage(acceptLanguage)
    if (matched) return matched
  }

  return DEFAULT_LOCALE
}

function parseAcceptLanguage(header: string): BlogLocale | null {
  const tokens = header
    .split(',')
    .map((item) => {
      const [lang, q] = item.trim().split(';q=')
      return { lang: lang?.toLowerCase() ?? '', q: q ? parseFloat(q) : 1.0 }
    })
    .filter((item) => item.lang && !Number.isNaN(item.q))
    .sort((a, b) => b.q - a.q)

  for (const { lang } of tokens) {
    if (lang === 'zh-tw' || lang === 'zh-hk' || lang === 'zh-mo' || lang.startsWith('zh-hant')) {
      return 'zh-TW'
    }
    if (lang === 'zh' || lang === 'zh-cn' || lang === 'zh-sg' || lang.startsWith('zh-hans')) {
      return 'zh-CN'
    }
    if (lang.startsWith('en')) {
      return 'en-US'
    }
  }
  return null
}
