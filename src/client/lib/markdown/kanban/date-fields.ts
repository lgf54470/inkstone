/**
 * Which property holds which day is decided once here: every surface that prints a date reads it
 * through these accessors, so an item cannot show one day on the board and another in the gallery.
 * `dueDate` is what the detail modal's due field writes, `endDate` is the generated schema's own
 * end column, and both are deadlines — a card carries at most one of them.
 */
import type { KanbanItem } from './types'

function readDayKey(item: KanbanItem, propertyId: string): string {
  const value = item.properties[propertyId]
  return typeof value === 'string' ? value : ''
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
