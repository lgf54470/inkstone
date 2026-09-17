import { describe, expect, it } from 'vitest'
import {
  buildTimelineDays,
  calculateTimelineBarGeometry,
  parseDaysDiff,
  TIMELINE_BAR_GAP,
  TIMELINE_BAR_OFFSET,
  TIMELINE_DAY_WIDTH,
} from './timeline-helpers'
import type { KanbanItem } from './types'

describe('timeline-helpers days and diff', () => {
  const baseDate = new Date('2026-06-15T00:00:00')

  it('buildTimelineDays builds sequential days with isToday flagged', () => {
    const days = buildTimelineDays(3, 3, baseDate)
    expect(days).toHaveLength(7)
    expect(days[0].dateStr).toBe('2026-06-12')
    expect(days[3].dateStr).toBe('2026-06-15')
    expect(days[3].isToday).toBe(true)
    expect(days[6].dateStr).toBe('2026-06-18')
  })

  it('parseDaysDiff accurately returns day difference', () => {
    expect(parseDaysDiff('2026-06-18', '2026-06-15')).toBe(3)
    expect(parseDaysDiff('2026-06-12', '2026-06-15')).toBe(-3)
    expect(parseDaysDiff('2026-06-15', '2026-06-15')).toBe(0)
    expect(parseDaysDiff('invalid', '2026-06-15')).toBe(0)
  })
})

describe('timeline-helpers multi-day span geometry', () => {
  const baseDate = new Date('2026-06-15T00:00:00')

  it('calculates multi-day span geometry accurately', () => {
    const days = buildTimelineDays(5, 10, baseDate)
    const item: KanbanItem = {
      id: 'task-1',
      title: 'Design Spec',
      properties: {
        startDate: '2026-06-12',
        dueDate: '2026-06-15',
      },
    }
    const geom = calculateTimelineBarGeometry(item, days)
    expect(geom.left).toBe(2 * TIMELINE_DAY_WIDTH + TIMELINE_BAR_OFFSET)
    expect(geom.width).toBe(4 * TIMELINE_DAY_WIDTH - TIMELINE_BAR_GAP)
  })

  it('handles inverted start and due dates gracefully', () => {
    const days = buildTimelineDays(5, 10, baseDate)
    const item: KanbanItem = {
      id: 'task-2',
      title: 'Inverted dates',
      properties: {
        startDate: '2026-06-16',
        dueDate: '2026-06-14',
      },
    }
    const geom = calculateTimelineBarGeometry(item, days)
    expect(geom.left).toBe(4 * TIMELINE_DAY_WIDTH + TIMELINE_BAR_OFFSET)
    expect(geom.width).toBe(3 * TIMELINE_DAY_WIDTH - TIMELINE_BAR_GAP)
  })
})

describe('timeline-helpers single date and fallback geometry', () => {
  const baseDate = new Date('2026-06-15T00:00:00')

  it('handles single date (startDate or dueDate)', () => {
    const days = buildTimelineDays(5, 10, baseDate)
    const itemDueOnly: KanbanItem = {
      id: 'task-3',
      title: 'Due only',
      properties: { dueDate: '2026-06-15' },
    }
    const geom = calculateTimelineBarGeometry(itemDueOnly, days)
    expect(geom.left).toBe(5 * TIMELINE_DAY_WIDTH + TIMELINE_BAR_OFFSET)
    expect(geom.width).toBe(TIMELINE_DAY_WIDTH - TIMELINE_BAR_GAP)
  })

  it('falls back to today when no dates are specified', () => {
    const days = buildTimelineDays(5, 10, baseDate)
    const itemNoDates: KanbanItem = {
      id: 'task-4',
      title: 'No dates',
      properties: {},
    }
    const geom = calculateTimelineBarGeometry(itemNoDates, days)
    expect(geom.left).toBe(5 * TIMELINE_DAY_WIDTH + TIMELINE_BAR_OFFSET)
    expect(geom.width).toBe(TIMELINE_DAY_WIDTH - TIMELINE_BAR_GAP)
  })
})
