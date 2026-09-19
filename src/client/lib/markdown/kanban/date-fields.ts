/**
 * Which property holds which day is decided once here: every surface that prints a date reads it
 * through these accessors, so an item cannot show one day on the board and another in the gallery.
 * `dueDate` is what the detail modal's due field writes, `endDate` is the generated schema's own
 * end column, and both are deadlines — a card carries at most one of them. Whether such a deadline
 * has been missed is decided here too, for the same reason: a badge that is late on one surface has
 * to be late on all of them.
 */
import { dateKey, daysBetweenKeys, formatDateKey } from '../../time'
import { isKanbanItemDone } from './item-status'
import type { KanbanItem } from './types'

function readDayKey(item: KanbanItem, propertyId: string): string {
  const value = item.properties[propertyId]
  return typeof value === 'string' ? value : ''
}

/**
 * A stored date value as the day it names, or `''` when it names none. A board authored elsewhere
 * may carry a time after the day, so the leading `YYYY-MM-DD` of an ISO timestamp still counts.
 */
export function kanbanDayKey(value: unknown): string {
  if (!value) return ''
  const match = String(value).trim().match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}

export function getKanbanStartDate(item: KanbanItem): string {
  return readDayKey(item, 'startDate')
}

export function getKanbanDueDate(item: KanbanItem): string {
  return readDayKey(item, 'dueDate') || readDayKey(item, 'endDate')
}

/** The day a card badge prints: its deadline, or the start when the card only has one. */
export function getKanbanCardDate(item: KanbanItem): string {
  return getKanbanDueDate(item) || getKanbanStartDate(item)
}

/**
 * Whole days between the card's deadline and `now`, or 0 when nothing was missed. Only a deadline
 * can be missed — a card that merely started long ago is not late — and finished work stops being
 * late about a date it already met.
 */
export function getKanbanOverdueDays(item: KanbanItem, now = new Date()): number {
  const deadline = kanbanDayKey(getKanbanDueDate(item))
  if (!deadline || isKanbanItemDone(item)) return 0
  return Math.max(0, daysBetweenKeys(deadline, dateKey(now)))
}

export interface KanbanCardDate {
  /** The day the badge carries, already in the reader's own date format. */
  dateText: string
  /** Whole days the deadline was missed by; 0 when the card is not late. */
  overdueDays: number
}

export function readKanbanCardDate(item: KanbanItem, now = new Date()): KanbanCardDate | null {
  const key = getKanbanCardDate(item)
  if (!key) return null
  return {
    dateText: formatDateKey(kanbanDayKey(key) || key, now),
    overdueDays: getKanbanOverdueDays(item, now),
  }
}
