import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { initI18n, setLocale } from './i18n'
import {
  addDaysKey, dateKey, daysBetweenKeys, formatBytes, formatTimecode, formatTotalDuration,
  isWeekRangeKey, parseDateKey, rollingWindowKey, weekStartKeyOf,
} from './time'

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

describe('sizes and durations', () => {
  beforeAll(async () => {
    await initI18n()
  })

  afterEach(async () => {
    await setLocale('en-US', false)
  })

  it('scales a size through the byte units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB')
  })

  it('renders a media position as mm:ss and degrades to zero', () => {
    expect(formatTimecode(0)).toBe('00:00')
    expect(formatTimecode(Number.NaN)).toBe('00:00')
    expect(formatTimecode(59_999)).toBe('00:59')
    expect(formatTimecode(60_000)).toBe('01:00')
    expect(formatTimecode(3_723_000)).toBe('62:03')
  })

  it('summarizes a total length in hours and minutes', () => {
    expect(formatTotalDuration(0)).toBe('0')
    expect(formatTotalDuration(Number.NaN)).toBe('0')
    expect(formatTotalDuration(30 * 60_000)).toBe('30 min')
    expect(formatTotalDuration(90 * 60_000)).toBe('1 hr, 30 min')
  })

  it('states a sub-minute total in seconds rather than nothing at all', () => {
    expect(formatTotalDuration(40_000)).toBe('40 sec')
  })

  it('writes a total in the reader\u2019s locale, not in English', async () => {
    await setLocale('zh-CN', false)
    expect(formatTotalDuration(30 * 60_000)).toBe('30\u5206\u949f')
    expect(formatTotalDuration(90 * 60_000)).toBe('1\u5c0f\u65f630\u5206\u949f')
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
})