import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { buildKanbanContextMenuItems, type KanbanContextMenuProps } from './kanban-context-menu'
import type { KanbanItem, KanbanView } from '../types'

beforeAll(async () => {
  await initI18n()
})

const dummyItem: KanbanItem = {
  id: 'item-1',
  title: 'Test Task',
  properties: { status: 'todo' },
}

const dummyViews: KanbanView[] = [
  { id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' },
  { id: 'view-table', name: 'Table', type: 'table' },
]

function createDummyProps(overrides: Partial<KanbanContextMenuProps> = {}): KanbanContextMenuProps {
  return {
    point: { x: 100, y: 100 },
    targetItem: null,
    selectedCount: 0,
    activeView: dummyViews[0]!,
    views: dummyViews,
    canUndo: false,
    canRedo: false,
    isFullscreen: false,
    onClose: vi.fn(),
    onAddItem: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

describe('card context menu items', () => {
  it('triggers item-specific actions', () => {
    const onOpenDetail = vi.fn()
    const onDuplicateItem = vi.fn()
    const onDeleteItem = vi.fn()

    const items = buildKanbanContextMenuItems(
      createDummyProps({
        targetItem: dummyItem,
        onOpenDetail,
        onDuplicateItem,
        onDeleteItem,
      }),
    )

    items.find((i) => i.id === 'kanban-item-detail')?.onSelect?.()
    expect(onOpenDetail).toHaveBeenCalledWith(dummyItem)

    items.find((i) => i.id === 'kanban-item-duplicate')?.onSelect?.()
    expect(onDuplicateItem).toHaveBeenCalledWith(dummyItem)

    items.find((i) => i.id === 'kanban-item-delete')?.onSelect?.()
    expect(onDeleteItem).toHaveBeenCalledWith('item-1')
  })

  it('configures undo, redo and fullscreen for card menu', () => {
    const items = buildKanbanContextMenuItems(
      createDummyProps({
        targetItem: dummyItem,
        canUndo: true,
        canRedo: false,
        isFullscreen: true,
        onToggleFullscreen: vi.fn(),
      }),
    )

    expect(items.find((i) => i.id === 'kanban-undo')?.disabled).toBe(false)
    expect(items.find((i) => i.id === 'kanban-redo')?.disabled).toBe(true)
    expect(items.find((i) => i.id === 'kanban-toggle-fullscreen')?.combo).toBe('Esc')
  })
})

describe('board context menu items', () => {
  it('builds board actions when clicking on canvas', () => {
    const items = buildKanbanContextMenuItems(
      createDummyProps({
        onAddColumn: vi.fn(),
        onSelectView: vi.fn(),
        onChangeCardSize: vi.fn(),
        cardSize: 'medium',
      }),
    )

    expect(items.find((i) => i.id === 'kanban-new-item')).toBeDefined()
    expect(items.find((i) => i.id === 'kanban-new-group')).toBeDefined()
    expect(items.find((i) => i.id === 'kanban-switch-view')?.submenu).toBeDefined()
    expect(items.find((i) => i.id === 'kanban-card-size')?.submenu).toBeDefined()
  })

  it('includes batch delete and clear selection when items selected', () => {
    const items = buildKanbanContextMenuItems(
      createDummyProps({
        selectedCount: 3,
        onBatchDelete: vi.fn(),
        onClearSelection: vi.fn(),
      }),
    )

    expect(items.find((i) => i.id === 'kanban-batch-delete')?.label).toContain('3')
    expect(items.find((i) => i.id === 'kanban-clear-selection')).toBeDefined()
  })
})
