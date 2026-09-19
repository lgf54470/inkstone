import { getKanbanDueDate, getKanbanStartDate } from './date-fields'
import type { KanbanItem } from './types'

export interface CalendarDay {
  date: Date
  dateStr: string
  dayNum: number
  isCurrentMonth: boolean
  isToday: boolean
}

export interface WeekEventSegment {
  item: KanbanItem
  startCol: number
  endCol: number
  isSegmentStart: boolean
  isSegmentEnd: boolean
  track: number
}

export function parseDateKey(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  const match = s.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

/**
 * How many cells precede the first of the month in a grid that opens on `weekStart`. Both calendar
 * surfaces index JS `getDay()` (Sunday = 0), so `weekStart` is 0-based here too.
 */
function cellsBefore(day: number, weekStart: number): number {
  return (day - weekStart + 7) % 7
}

export function getMonthWeeks(year: number, month: number, weekStart: number): CalendarDay[][] {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const formatStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const todayStr = formatStr(new Date())

  const firstDate = new Date(year, month, 1)
  const startDate = new Date(year, month, 1 - cellsBefore(firstDate.getDay(), weekStart))

  const lastDate = new Date(year, month + 1, 0)
  const endDate = new Date(year, month + 1, 6 - cellsBefore(lastDate.getDay(), weekStart))

  const weeks: CalendarDay[][] = []
  const curr = new Date(startDate)

  while (curr <= endDate) {
    const week: CalendarDay[] = []
    for (let i = 0; i < 7; i++) {
      const dateStr = formatStr(curr)
      week.push({
        date: new Date(curr),
        dateStr,
        dayNum: curr.getDate(),
        isCurrentMonth: curr.getMonth() === month,
        isToday: dateStr === todayStr,
      })
      curr.setDate(curr.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

function resolveItemDateRange(item: KanbanItem, dateField?: string): { start: string; end: string } | null {
  const primary = dateField ? item.properties[dateField] : undefined
  const startKey = parseDateKey(primary || getKanbanStartDate(item) || getKanbanDueDate(item))
  const endKey = parseDateKey(getKanbanDueDate(item) || primary || getKanbanStartDate(item))
  if (!startKey && !endKey) return null

  if (startKey && endKey) {
    return startKey <= endKey ? { start: startKey, end: endKey } : { start: endKey, end: startKey }
  }
  const single = (startKey || endKey)!
  return { start: single, end: single }
}

function assignTracks(rawSegments: Omit<WeekEventSegment, 'track'>[]): WeekEventSegment[] {
  const trackOccupied: number[] = []
  const segments: WeekEventSegment[] = []

  for (const seg of rawSegments) {
    let assignedTrack = -1
    for (let t = 0; t < trackOccupied.length; t++) {
      if (trackOccupied[t] < seg.startCol) {
        assignedTrack = t
        trackOccupied[t] = seg.endCol
        break
      }
    }
    if (assignedTrack === -1) {
      assignedTrack = trackOccupied.length
      trackOccupied.push(seg.endCol)
    }
    segments.push({ ...seg, track: assignedTrack })
  }

  return segments
}

export function getWeekEventSegments(items: KanbanItem[], week: CalendarDay[], dateField?: string): WeekEventSegment[] {
  if (!week.length) return []
  const weekStart = week[0].dateStr
  const weekEnd = week[6].dateStr
  const rawSegments: Omit<WeekEventSegment, 'track'>[] = []

  for (const item of items) {
    const range = resolveItemDateRange(item, dateField)
    if (!range || range.end < weekStart || range.start > weekEnd) continue

    const startCol = range.start < weekStart ? 0 : week.findIndex((d) => d.dateStr === range.start)
    const endCol = range.end > weekEnd ? 6 : week.findIndex((d) => d.dateStr === range.end)

    if (startCol === -1 || endCol === -1 || startCol > endCol) continue

    rawSegments.push({
      item,
      startCol,
      endCol,
      isSegmentStart: range.start >= weekStart,
      isSegmentEnd: range.end <= weekEnd,
    })
  }

  rawSegments.sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol
    return (b.endCol - b.startCol) - (a.endCol - a.startCol)
  })

  return assignTracks(rawSegments)
}
