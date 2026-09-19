import { describe, expect, it } from 'vitest'
import { getMonthWeeks, getWeekEventSegments, parseDateKey } from './calendar-helpers'
import type { KanbanItem } from './types'

describe('calendar-helpers parsing & month generation', () => {
  it('parseDateKey parses standard and ISO dates correctly', () => {
    expect(parseDateKey('2026-09-17')).toBe('2026-09-17')
    expect(parseDateKey('2026-09-17T12:00:00Z')).toBe('2026-09-17')
    expect(parseDateKey('invalid')).toBeNull()
    expect(parseDateKey('')).toBeNull()
    expect(parseDateKey(null)).toBeNull()
  })

  it('getMonthWeeks generates 7-day weeks spanning the month', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    expect(weeks.length).toBeGreaterThanOrEqual(4)
    for (const week of weeks) {
      expect(week.length).toBe(7)
    }
    const allDays = weeks.flat()
    const septDays = allDays.filter((d) => d.isCurrentMonth)
    expect(septDays.length).toBe(30)
  })
})

/**
 * Which weekday opens the grid is a fact about the reader's calendar, so `getMonthWeeks` is asked
 * for it rather than assuming Sunday. Sunday 2026-08-30, Monday 2026-08-31 and Saturday 2026-08-29
 * are the three cells September 2026 therefore begins on — CLDR answers for en-US, zh-CN and ar-EG,
 * checked here independently of any locale so the view can pass whatever `Intl` told it. The same
 * number has to close each row too: the Saturday case measured here is one where a Sunday-based
 * closing weekday spills a whole extra row of October days under September.
 */
describe('the month grid opens on the weekday it is told to', () => {
  it.each([
    [0, '2026-08-30'],
    [1, '2026-08-31'],
    [6, '2026-08-29'],
  ] as const)('week start %s puts %s in the first cell of September 2026', (weekStart, firstCell) => {
    const weeks = getMonthWeeks(2026, 8, weekStart)
    expect(weeks[0][0].dateStr).toBe(firstCell)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
      expect(localDay(week[0].dateStr)).toBe(weekStart)
    }
    expect(localDay(weeks[weeks.length - 1][6].dateStr)).toBe((weekStart + 6) % 7)
    expect(
      weeks.every((week) => week.some((day) => day.isCurrentMonth)),
      'the grid draws a row that holds no day of the month',
    ).toBe(true)
    expect(weeks.flat().filter((d) => d.isCurrentMonth)).toHaveLength(30)
  })
})

function localDay(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

describe('calendar-helpers single & multi-day segment generation', () => {
  it('getWeekEventSegments handles single-day event', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    const targetWeek = weeks.find((w) => w.some((d) => d.dateStr === '2026-09-17'))!
    const item: KanbanItem = {
      id: 'task-1',
      title: 'Single Day Task',
      properties: { dueDate: '2026-09-17' },
    }
    const segments = getWeekEventSegments([item], targetWeek)
    expect(segments.length).toBe(1)
    expect(segments[0].startCol).toBe(segments[0].endCol)
    expect(segments[0].isSegmentStart).toBe(true)
    expect(segments[0].isSegmentEnd).toBe(true)
    expect(segments[0].track).toBe(0)
  })

  it('getWeekEventSegments handles multi-day event spanning within week', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    const targetWeek = weeks.find((w) => w.some((d) => d.dateStr === '2026-09-15'))!
    const item: KanbanItem = {
      id: 'task-2',
      title: 'Multi Day Task',
      properties: { startDate: '2026-09-15', dueDate: '2026-09-18' },
    }
    const segments = getWeekEventSegments([item], targetWeek)
    expect(segments.length).toBe(1)
    expect(segments[0].endCol - segments[0].startCol).toBe(3)
    expect(segments[0].isSegmentStart).toBe(true)
    expect(segments[0].isSegmentEnd).toBe(true)
  })
})

describe('calendar-helpers cross-week and track collisions', () => {
  it('getWeekEventSegments splits cross-week multi-day event and allocates tracks without collision', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    const week1 = weeks[2]
    const item1: KanbanItem = {
      id: 't1',
      title: 'Task 1',
      properties: { startDate: week1[1].dateStr, dueDate: week1[4].dateStr },
    }
    const item2: KanbanItem = {
      id: 't2',
      title: 'Task 2 Overlapping',
      properties: { startDate: week1[3].dateStr, dueDate: week1[5].dateStr },
    }
    const segments = getWeekEventSegments([item1, item2], week1)
    expect(segments.length).toBe(2)
    expect(segments[0].track).toBe(0)
    expect(segments[1].track).toBe(1)
  })
})

describe('calendar-helpers view-configured date field', () => {
  it('places the event by the view-configured date field', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    const targetWeek = weeks.find((w) => w.some((d) => d.dateStr === '2026-09-17'))!
    const milestoneCol = targetWeek.findIndex((d) => d.dateStr === '2026-09-17')
    const item: KanbanItem = {
      id: 'task-cfg',
      title: 'Configured date',
      properties: { milestone: '2026-09-17' },
    }
    const segments = getWeekEventSegments([item], targetWeek, 'milestone')
    expect(segments.length).toBe(1)
    expect(segments[0].startCol).toBe(milestoneCol)
    expect(segments[0].endCol).toBe(milestoneCol)
  })

  it('keeps the legacy fallback chain when the configured field holds no value', () => {
    const weeks = getMonthWeeks(2026, 8, 0)
    const targetWeek = weeks.find((w) => w.some((d) => d.dateStr === '2026-09-17'))!
    const item: KanbanItem = {
      id: 'task-legacy',
      title: 'Legacy due date',
      properties: { dueDate: '2026-09-17' },
    }
    const segments = getWeekEventSegments([item], targetWeek, 'milestone')
    expect(segments.length).toBe(1)
    expect(segments[0].startCol).toBe(targetWeek.findIndex((d) => d.dateStr === '2026-09-17'))
  })
})
