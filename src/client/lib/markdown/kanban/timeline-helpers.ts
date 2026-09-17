import type { KanbanItem } from './types'

export interface TimelineDay {
  day: number
  dateStr: string
  isToday: boolean
}

export const TIMELINE_DAY_WIDTH = 48
export const TIMELINE_BAR_OFFSET = 4
export const TIMELINE_BAR_GAP = 8
const MS_PER_DAY = 86400000

function formatDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildTimelineDays(daysBefore = 7, daysAfter = 21, baseDate = new Date()): TimelineDay[] {
  const list: TimelineDay[] = []
  const todayStr = formatDateStr(baseDate)

  for (let i = -daysBefore; i <= daysAfter; i++) {
    const d = new Date(baseDate)
    d.setDate(baseDate.getDate() + i)
    const dateStr = formatDateStr(d)
    list.push({
      day: d.getDate(),
      dateStr,
      isToday: dateStr === todayStr,
    })
  }
  return list
}

export function parseDaysDiff(d1Str: string, d2Str: string): number {
  const d1 = new Date(d1Str + 'T00:00:00')
  const d2 = new Date(d2Str + 'T00:00:00')
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0
  return Math.round((d1.getTime() - d2.getTime()) / MS_PER_DAY)
}

function resolveStartEndIndex(
  startProp: string,
  dueProp: string,
  baseDateStr: string,
  todayIndex: number,
): { startIdx: number; endIdx: number } {
  if (startProp && dueProp) {
    const s = parseDaysDiff(startProp, baseDateStr)
    const e = parseDaysDiff(dueProp, baseDateStr)
    return { startIdx: Math.min(s, e), endIdx: Math.max(s, e) }
  }
  if (startProp) {
    const s = parseDaysDiff(startProp, baseDateStr)
    return { startIdx: s, endIdx: s }
  }
  if (dueProp) {
    const e = parseDaysDiff(dueProp, baseDateStr)
    return { startIdx: e, endIdx: e }
  }
  return { startIdx: todayIndex, endIdx: todayIndex }
}

export function calculateTimelineBarGeometry(
  item: KanbanItem,
  days: TimelineDay[],
  colWidth = TIMELINE_DAY_WIDTH,
): { left: number; width: number } {
  if (days.length === 0) return { left: 0, width: colWidth - TIMELINE_BAR_GAP }

  const baseDateStr = days[0].dateStr
  const startProp = item.properties.startDate ? String(item.properties.startDate) : ''
  const dueProp = item.properties.dueDate ? String(item.properties.dueDate) : ''
  const todayIndex = Math.max(0, days.findIndex((d) => d.isToday))

  const { startIdx, endIdx } = resolveStartEndIndex(startProp, dueProp, baseDateStr, todayIndex)
  const spanDays = Math.max(1, endIdx - startIdx + 1)
  const left = startIdx * colWidth + TIMELINE_BAR_OFFSET
  const width = Math.max(colWidth - TIMELINE_BAR_GAP, spanDays * colWidth - TIMELINE_BAR_GAP)

  return { left, width }
}
