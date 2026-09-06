import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatDate,
  formatMonthDay,
  formatMonthYear,
  isSupportedLocale,
  resolveLocale,
  t,
} from './index'
import { ZH_CN_MESSAGES } from './locales/zh-CN'
import { ZH_TW_MESSAGES } from './locales/zh-TW'
import { EN_US_MESSAGES } from './locales/en-US'

describe('i18n dictionary integrity', () => {
  const cnKeys = Object.keys(ZH_CN_MESSAGES).sort()
  const twKeys = Object.keys(ZH_TW_MESSAGES).sort()
  const enKeys = Object.keys(EN_US_MESSAGES).sort()

  it('defines expected supported locales and default', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'zh-TW', 'en-US'])
    expect(DEFAULT_LOCALE).toBe('zh-CN')
  })

  it('all three locales have identical keys', () => {
    expect(twKeys).toEqual(cnKeys)
    expect(enKeys).toEqual(cnKeys)
  })

  it('all message keys have valid translations without empty values', () => {
    for (const key of cnKeys) {
      expect(ZH_CN_MESSAGES[key as keyof typeof ZH_CN_MESSAGES]).toBeTruthy()
      expect(ZH_TW_MESSAGES[key as keyof typeof ZH_TW_MESSAGES]).toBeTruthy()
      expect(EN_US_MESSAGES[key as keyof typeof EN_US_MESSAGES]).toBeTruthy()
    }
  })

  it('placeholders match across all locales for every key', () => {
    const extractPlaceholders = (text: string) =>
      [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort()

    for (const key of cnKeys) {
      const cnParams = extractPlaceholders(ZH_CN_MESSAGES[key as keyof typeof ZH_CN_MESSAGES])
      const twParams = extractPlaceholders(ZH_TW_MESSAGES[key as keyof typeof ZH_TW_MESSAGES])
      const enParams = extractPlaceholders(EN_US_MESSAGES[key as keyof typeof EN_US_MESSAGES])

      expect(twParams).toEqual(cnParams)
      expect(enParams).toEqual(cnParams)
    }
  })
})

describe('i18n helper functions', () => {
  it('isSupportedLocale checks valid locales', () => {
    expect(isSupportedLocale('zh-CN')).toBe(true)
    expect(isSupportedLocale('zh-TW')).toBe(true)
    expect(isSupportedLocale('en-US')).toBe(true)
    expect(isSupportedLocale('fr-FR')).toBe(false)
    expect(isSupportedLocale(null)).toBe(false)
  })

  it('t interpolates parameters properly', () => {
    expect(t('home.posts_count', { count: 5 }, 'zh-CN')).toBe('(5 篇)')
    expect(t('home.posts_count', { count: 5 }, 'zh-TW')).toBe('(5 篇)')
    expect(t('home.posts_count', { count: 5 }, 'en-US')).toBe('(5 posts)')
  })

  it('formatDate respects locale', () => {
    const date = new Date('2026-03-06T12:00:00Z')
    expect(formatDate(date, 'zh-CN')).toContain('2026')
    expect(formatDate(date, 'en-US')).toContain('March')
  })

  it('formatMonthYear formats year and month according to locale', () => {
    expect(formatMonthYear(2026, 3, 'zh-CN')).toBe('2026年 3月')
    expect(formatMonthYear(2026, 3, 'zh-TW')).toBe('2026年 3月')
    expect(formatMonthYear(2026, 3, 'en-US')).toBe('March 2026')
  })

  it('formatMonthDay handles invalid date gracefully', () => {
    expect(formatMonthDay('invalid-date')).toBe('')
  })
})

describe('resolveLocale resolution order', () => {
  it('prioritizes query param when valid', () => {
    expect(resolveLocale('zh-TW', 'en-US', 'en-US')).toBe('en-US')
    expect(resolveLocale('zh-CN', 'en-US', 'invalid')).toBe('zh-CN')
  })

  it('uses cookie when query param is missing or invalid', () => {
    expect(resolveLocale('zh-TW', 'en-US', null)).toBe('zh-TW')
    expect(resolveLocale('en-US', 'zh-CN', '')).toBe('en-US')
  })

  it('falls back to Accept-Language header matching', () => {
    expect(resolveLocale(null, 'zh-TW,zh;q=0.9,en;q=0.8', null)).toBe('zh-TW')
    expect(resolveLocale(null, 'zh-HK,zh;q=0.9', null)).toBe('zh-TW')
    expect(resolveLocale(null, 'zh-CN,zh;q=0.9', null)).toBe('zh-CN')
    expect(resolveLocale(null, 'en-US,en;q=0.9', null)).toBe('en-US')
  })

  it('falls back to DEFAULT_LOCALE when nothing matches', () => {
    expect(resolveLocale(null, null, null)).toBe(DEFAULT_LOCALE)
    expect(resolveLocale('invalid', 'fr-FR', null)).toBe(DEFAULT_LOCALE)
  })
})
