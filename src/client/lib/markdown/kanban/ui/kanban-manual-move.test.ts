import { describe, expect, it, vi } from 'vitest'
import { makeMoveItemClearingSorts } from './kanban-manual-move'
import type { KanbanSort } from '../types'

const activeSorts: KanbanSort[] = [{ propertyId: 'title', direction: 'asc' }]

describe('manual card move while sorted', () => {
  it('clears the active sorts and notifies so the dragged order becomes visible', () => {
    const moveItem = vi.fn()
    const clearSorts = vi.fn()
    const notifySortCleared = vi.fn()
    const onMove = makeMoveItemClearingSorts({
      moveItem,
      getSorts: () => activeSorts,
      clearSorts,
      notifySortCleared,
    })
    onMove('i-1', 'doing', { itemId: 'i-2', position: 'before' })
    expect(moveItem).toHaveBeenCalledWith('i-1', 'doing', { itemId: 'i-2', position: 'before' })
    expect(clearSorts).toHaveBeenCalledTimes(1)
    expect(notifySortCleared).toHaveBeenCalledTimes(1)
  })

  it('keeps the sorts untouched and stays silent when nothing is sorted', () => {
    const moveItem = vi.fn()
    const clearSorts = vi.fn()
    const notifySortCleared = vi.fn()
    const onMove = makeMoveItemClearingSorts({
      moveItem,
      getSorts: () => [],
      clearSorts,
      notifySortCleared,
    })
    onMove('i-1', 'done')
    expect(moveItem).toHaveBeenCalledWith('i-1', 'done', undefined)
    expect(clearSorts).not.toHaveBeenCalled()
    expect(notifySortCleared).not.toHaveBeenCalled()
  })
})
