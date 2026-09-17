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
    const weeks = getMonthWeeks(2026, 8)
    expect(weeks.length).toBeGreaterThanOrEqual(4)
    for (const week of weeks) {
      expect(week.length).toBe(7)
    }
    const allDays = weeks.flat()
    const septDays = allDays.filter((d) => d.isCurrentMonth)
    expect(septDays.length).toBe(30)
  })
})

describe('calendar-helpers single & multi-day segment generation', () => {
  it('getWeekEventSegments handles single-day event', () => {
    const weeks = getMonthWeeks(2026, 8)
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
    const weeks = getMonthWeeks(2026, 8)
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
    const weeks = getMonthWeeks(2026, 8)
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
