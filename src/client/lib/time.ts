import type { DateRangeFilter } from '@shared/types'
import { localeTag, t } from './i18n'


const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Day-key arithmetic: the key `delta` days after (or before) `key`. */
export function addDaysKey(key: string, delta: number): string {
  const date = parseDateKey(key)
  date.setDate(date.getDate() + delta)
  return dateKey(date)
}

/** Inclusive day window of `days` entries ending at `anchor` (1 = a single day). */
export function rollingWindowKey(days: number, anchor: string): DateRangeFilter {
  return { start: addDaysKey(anchor, -(Math.max(1, days) - 1)), end: anchor }
}

/** Whole days from `a` to `b` (negative when `b` is earlier), using UTC day math to stay DST-safe. */
export function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Key of the week's first day (per `weekStart`) containing `key`. */
export function weekStartKeyOf(key: string, weekStart: 0 | 1): string {
  const date = parseDateKey(key)
  date.setDate(date.getDate() - ((date.getDay() - weekStart + 7) % 7))
  return dateKey(date)
}

/** Whether an inclusive day-key range spans exactly one aligned week. */
export function isWeekRangeKey(start: string, end: string, weekStart: 0 | 1): boolean {
  return start === weekStartKeyOf(start, weekStart) && end === addDaysKey(start, 6)
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function previousDay(date: Date): Date {
  const previous = new Date(date)
  previous.setDate(previous.getDate() - 1)
  return previous
}

function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(localeTag(), options)
}


export function shortTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || !ts) return ''
  const date = new Date(ts)
  const today = new Date(now)
  const diff = now - ts
  const distance = Math.abs(diff)

  if (distance < MINUTE) return t("time.just_now")
  if (diff < 0 && -diff < HOUR) return relative(Math.ceil(-diff / MINUTE), 'minute')
  if (diff >= 0 && diff < HOUR) return relative(-Math.floor(diff / MINUTE), 'minute')
  if (isSameDay(date, today)) {
    return dateTimeFormat({ hour: '2-digit', minute: '2-digit' }).format(date)
  }
  if (diff >= 0 && isSameDay(date, previousDay(today))) return t("time.yesterday")
  if (distance < 7 * DAY) return dateTimeFormat({ weekday: 'short' }).format(date)
  if (date.getFullYear() === today.getFullYear()) {
    return dateTimeFormat({ month: 'short', day: 'numeric' }).format(date)
  }
  return dateTimeFormat({ year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}


export function fullTime(ts: number): string {
  if (!Number.isFinite(ts) || !ts) return '—'
  return dateTimeFormat({
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts))
}


export function relativeTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || !ts) return '—'
  const diff = now - ts
  const distance = Math.abs(diff)
  if (distance < MINUTE) return t("time.just_now")
  const direction = diff < 0 ? 1 : -1
  const rounded = (unit: number) => direction * (direction > 0
    ? Math.ceil(distance / unit)
    : Math.floor(distance / unit))
  if (distance < HOUR) return relative(rounded(MINUTE), 'minute')
  if (distance < DAY) return relative(rounded(HOUR), 'hour')
  if (distance < 30 * DAY) return relative(rounded(DAY), 'day')
  if (distance < 365 * DAY) return relative(rounded(30 * DAY), 'month')
  return relative(rounded(365 * DAY), 'year')
}


export function groupLabel(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || !ts) return '—'
  const date = new Date(ts)
  const today = new Date(now)
  const diff = now - ts
  if (isSameDay(date, today)) return t("time.today")
  if (diff >= 0 && isSameDay(date, previousDay(today))) return t("time.yesterday")
  if (diff >= 0 && diff < 7 * DAY) return t("time.this_week")
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()) {
    return t("time.this_month")
  }
  if (date.getFullYear() === today.getFullYear()) {
    return dateTimeFormat({ month: 'long' }).format(date)
  }
  return dateTimeFormat({ year: 'numeric', month: 'long' }).format(date)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  const duration = Number.isFinite(ms) ? Math.max(0, ms) : 0
  if (duration < 1000) return formatUnit(Math.round(duration), 'millisecond')
  const totalSeconds = Math.round(duration / 1000)
  if (totalSeconds < 60) return formatUnit(Number((duration / 1000).toFixed(1)), 'second')
  return `${formatUnit(Math.floor(totalSeconds / 60), 'minute')} ${formatUnit(totalSeconds % 60, 'second')}`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(localeTag()).format(n)
}

function formatUnit(value: number, unit: 'millisecond' | 'second' | 'minute'): string {
  return new Intl.NumberFormat(localeTag(), {
    style: 'unit',
    unit,
    unitDisplay: 'long',
    maximumFractionDigits: 1,
  }).format(value)
}

function relative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(localeTag(), { numeric: 'always' }).format(value, unit)
}
