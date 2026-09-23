/**
 * The archive: cards a board has finished with but must not lose. An archived card leaves every
 * view, every count and every still snapshot, and comes back only through restore — deletion, by
 * contrast, is the operation the archive exists to keep people away from.
 */
import type { KanbanItem } from './types'

/** Only a literal `true` archives a card: whatever else an author wrote is noise, not an archive. */
export function kanbanIsArchived(item: KanbanItem): boolean {
  return item.archived === true
}

export function kanbanActiveItems(items: KanbanItem[]): KanbanItem[] {
  return items.filter((item) => !kanbanIsArchived(item))
}

export function kanbanArchivedItems(items: KanbanItem[]): KanbanItem[] {
  return items.filter(kanbanIsArchived)
}

/**
 * Archive or restore the cards named by `ids`; ids the document does not hold are ignored. A batch
 * that changes nothing returns the very same array, so a writer can commit zero steps of undo
 * instead of a rewrite that looks like an edit.
 */
export function kanbanSetArchived(
  items: KanbanItem[],
  ids: Iterable<string>,
  archived: boolean,
): KanbanItem[] {
  const wanted = new Set(ids)
  if (wanted.size === 0) return items
  let changed = false
  const next = items.map((item) => {
    if (!wanted.has(item.id) || kanbanIsArchived(item) === archived) return item
    changed = true
    if (!archived) {
      const restored: KanbanItem = { ...item }
      delete restored.archived
      return restored
    }
    return { ...item, archived: true }
  })
  return changed ? next : items
}
