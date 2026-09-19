import { describe, expect, it } from 'vitest'
import { addDaysKey, dateKey, daysBetweenKeys, isWeekRangeKey, narrowWeekdayLabels, parseDateKey, rollingWindowKey, weekStartFor, weekStartKeyOf } from './time'

describe('dateKey', () => {
  it('formats local dates as zero-padded YYYY-MM-DD keys', () => {
    expect(dateKey(new Date(2026, 8, 2))).toBe('2026-09-02')
    expect(dateKey(new Date(2026, 0, 9))).toBe('2026-01-09')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('round-trips through parseDateKey', () => {
    const parsed = parseDateKey('2026-02-14')
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual([2026, 1, 14])
    expect(dateKey(parsed)).toBe('2026-02-14')
  })
})

describe('addDaysKey', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysKey('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysKey('2024-03-01', -1)).toBe('2024-02-29')
  })
})

describe('rollingWindowKey', () => {
  it('builds an inclusive window ending at the anchor', () => {
    expect(rollingWindowKey(7, '2026-09-09')).toEqual({ start: '2026-09-03', end: '2026-09-09' })
    expect(rollingWindowKey(1, '2026-09-09')).toEqual({ start: '2026-09-09', end: '2026-09-09' })
    expect(rollingWindowKey(30, '2026-09-09')).toEqual({ start: '2026-08-11', end: '2026-09-09' })
  })
})

describe('daysBetweenKeys', () => {
  it('counts whole days across month boundaries using UTC math', () => {
    expect(daysBetweenKeys('2026-09-09', '2026-09-03')).toBe(-6)
    expect(daysBetweenKeys('2026-08-01', '2026-09-01')).toBe(31)
    expect(daysBetweenKeys('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetweenKeys('2026-09-09', '2026-09-09')).toBe(0)
  })
})

describe('week keys', () => {
  it('aligns a key to its week start for both weekStart modes', () => {
    expect(weekStartKeyOf('2026-09-09', 1)).toBe('2026-09-07')
    expect(weekStartKeyOf('2026-09-09', 0)).toBe('2026-09-06')
    expect(weekStartKeyOf('2026-09-07', 1)).toBe('2026-09-07')
  })

  it('recognizes exactly-aligned week ranges', () => {
    expect(isWeekRangeKey('2026-09-07', '2026-09-13', 1)).toBe(true)
    expect(isWeekRangeKey('2026-09-06', '2026-09-12', 0)).toBe(true)
    expect(isWeekRangeKey('2026-09-08', '2026-09-13', 1)).toBe(false)
    expect(isWeekRangeKey('2026-09-07', '2026-09-12', 1)).toBe(false)
    expect(isWeekRangeKey('2026-09-07', '2026-09-13', 0)).toBe(false)
  })

  it('aligns to a week that starts on the saturday some calendars open on', () => {
    expect(weekStartKeyOf('2026-09-09', 6)).toBe('2026-09-05')
    expect(isWeekRangeKey('2026-09-05', '2026-09-11', 6)).toBe(true)
  })
})

/**
 * Which weekday opens a calendar is a fact about the reader's calendar, not about the two languages
 * this app happens to ship: `locale === 'zh-CN' ? 1 : 0` gets today's locales right only because
 * they are the two it names, and would quietly open a German or Arabic calendar on Sunday the day a
 * third locale lands. These cases pin the derivation to locale data plus one explicit fallback for
 * a runtime without `Intl.Locale#getWeekInfo`.
 */
describe('weekStartFor', () => {
  it('reads the first column off the locale, not off the languages the app ships', () => {
    // Sunday for the US, Monday for China and Germany, Saturday for Egypt — all CLDR, none of them
    // a language this app's own locale switch can even select today.
    expect(weekStartFor('en-US')).toBe(0)
    expect(weekStartFor('zh-CN')).toBe(1)
    expect(weekStartFor('de-DE')).toBe(1)
    expect(weekStartFor('ar-EG')).toBe(6)
  })

  it('keeps a documented answer when the runtime has no week data', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, 'getWeekInfo')
    Object.defineProperty(Intl.Locale.prototype, 'getWeekInfo', { value: undefined, configurable: true })
    try {
      expect(weekStartFor('en-US')).toBe(0)
      expect(weekStartFor('zh-CN')).toBe(1)
    } finally {
      if (descriptor)
        Object.defineProperty(Intl.Locale.prototype, 'getWeekInfo', descriptor)
      else
        delete Intl.Locale.prototype.getWeekInfo
    }
  })
})

describe('narrowWeekdayLabels', () => {
  it('labels the columns in the same order the grid opens them', () => {
    for (const weekStart of [0, 1, 6] as const) {
      const labels = narrowWeekdayLabels('de-DE', weekStart)
      expect(labels).toHaveLength(7)
      labels.forEach((label, index) => {
        expect(label, `column ${index}`).toBe(narrowWeekday('de-DE', (weekStart + index) % 7))
      })
    }
  })

  it('repeats a label where seven distinct ones do not fit, so labels cannot be keys', () => {
    const labels = narrowWeekdayLabels('en-US', 0)
    expect(labels[0]).toBe(labels[6])
    expect(new Set(labels).size).toBeLessThan(7)
  })
})

// 2024-01-07 is a Sunday, the same reference date the derivation walks from.
function narrowWeekday(locale: string, jsDay: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + jsDay))
}