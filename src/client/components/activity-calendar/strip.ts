import type { DateRangeFilter } from '@shared/types'
import { dateKey, type WeekStartDay } from '../../lib/time'
import { alignWeekStart } from './range'



// The darkest level is capped by contrast rather than by taste: a day number is primary text on
// this tint, and the cap has to hold for every accent the appearance setting offers, in both
// themes — at 70% the darkest cells read 3.58:1 under indigo (dark) and 3.90:1 under graphite
// (light), where AA needs 4.5. 50% is the highest level all fourteen measure above it
// (scripts/check-contrast.mjs re-measures the cells for each accent and theme).
export const HEAT_PERCENTS = [0, 12, 24, 36, 50] as const





const DEFAULT_WEEKS = 16



export interface CalendarDayNote {
  id: string
  title: string
}



export interface WeekCell {
  key: string
  count: number
  today: boolean
  selected: boolean
  level: number
  diaryId: string | null
  notes: CalendarDayNote[]
}



export interface BuildStripWeeksOptions {
  range?: { start: Date; end: Date }
  weekStart?: WeekStartDay
  now?: Date
  todayKey?: string
  selectedRange?: DateRangeFilter | null
  getDiaryId?: (key: string) => string | null
  notesByDay?: ReadonlyMap<string, CalendarDayNote[]>
}



export function buildStripWeeks(counts: ReadonlyMap<string, number>, options: BuildStripWeeksOptions = {}): WeekCell[][] {
  const weekStart = options.weekStart ?? 0
  const anchor = alignWeekStart(options.range ? new Date(options.range.end) : (options.now ?? new Date()), weekStart)
  const rangeStart = options.range
    ? alignWeekStart(new Date(options.range.start), weekStart)
    : (() => {
      const d = new Date(anchor)
      d.setDate(d.getDate() - (DEFAULT_WEEKS - 1) * 7)
      return d
    })()
  const weekCount = Math.max(1, Math.round((anchor.getTime() - rangeStart.getTime()) / (7 * 24 * 3600 * 1000)) + 1)
  let max = 0
  const raw: { key: string; count: number; today: boolean; selected: boolean }[] = []
  const cursorDate = new Date(rangeStart)
  const selectedRange = options.selectedRange
  const inRange = (key: string) => selectedRange != null && key >= selectedRange.start && key <= selectedRange.end
  for (let index = 0; index < weekCount * 7; index++) {
    const key = dateKey(cursorDate)
    const count = counts.get(key) ?? 0
    if (count > max)
      max = count
    raw.push({ key, count, today: key === options.todayKey, selected: inRange(key) })
    cursorDate.setDate(cursorDate.getDate() + 1)
  }
  const weeks: WeekCell[][] = []
  for (let week = 0; week < weekCount; week++) {
    weeks.push(raw.slice(week * 7, week * 7 + 7).map(({ key, count, today, selected }) => ({
      key,
      count,
      today,
      selected,
      level: count === 0 ? 0 : Math.max(1, Math.round((4 * count) / Math.max(1, max))),
      diaryId: options.getDiaryId?.(key) ?? null,
      notes: options.notesByDay?.get(key) ?? [],
    })))
  }
  return weeks
}
