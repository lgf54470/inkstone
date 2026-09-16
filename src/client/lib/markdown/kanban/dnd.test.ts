import { describe, expect, it } from 'vitest'
import {
  parseKanbanDragData,
  reorderKanbanColumns,
  reorderKanbanItems,
} from './dnd'
import type { KanbanItem, KanbanProperty } from './types'

describe('parseKanbanDragData', () => {
  it('parses valid json card payload', () => {
    const mockDataTransfer = {
      getData: (format: string) =>
        format === 'application/json'
          ? JSON.stringify({ type: 'card', itemId: 'item-1', sourceGroupKey: 'todo' })
          : '',
    } as unknown as DataTransfer

    const result = parseKanbanDragData(mockDataTransfer)
    expect(result).toEqual({ type: 'card', itemId: 'item-1', sourceGroupKey: 'todo' })
  })

  it('parses valid json column payload', () => {
    const mockDataTransfer = {
      getData: (format: string) =>
        format === 'application/json'
          ? JSON.stringify({ type: 'column', groupKey: 'in_progress' })
          : '',
    } as unknown as DataTransfer

    const result = parseKanbanDragData(mockDataTransfer)
    expect(result).toEqual({ type: 'column', groupKey: 'in_progress' })
  })

  it('falls back to text/plain when json is not available or invalid', () => {
    const mockDataTransfer = {
      getData: (format: string) => (format === 'text/plain' ? 'item-99' : '{bad json'),
    } as unknown as DataTransfer

    const result = parseKanbanDragData(mockDataTransfer)
    expect(result).toEqual({ type: 'card', itemId: 'item-99', sourceGroupKey: '' })
  })
})

describe('reorderKanbanItems', () => {
  const sampleItems: KanbanItem[] = [
    { id: '1', title: 'Task 1', properties: { status: 'todo' } },
    { id: '2', title: 'Task 2', properties: { status: 'todo' } },
    { id: '3', title: 'Task 3', properties: { status: 'todo' } },
    { id: '4', title: 'Task 4', properties: { status: 'done' } },
  ]

  it('moves an item within the same column', () => {
    const reordered = reorderKanbanItems(sampleItems, '3', 'status', 'todo', 0)
    expect(reordered.map((i) => i.id)).toEqual(['3', '1', '2', '4'])
  })

  it('moves an item to another column without target index (appends)', () => {
    const reordered = reorderKanbanItems(sampleItems, '1', 'status', 'done')
    const doneItems = reordered.filter((i) => i.properties.status === 'done')
    expect(doneItems.map((i) => i.id)).toEqual(['4', '1'])
  })

  it('moves an item to another column at specific index', () => {
    const reordered = reorderKanbanItems(sampleItems, '1', 'status', 'done', 0)
    const doneItems = reordered.filter((i) => i.properties.status === 'done')
    expect(doneItems.map((i) => i.id)).toEqual(['1', '4'])
  })

  it('moves an item to __none__ column', () => {
    const reordered = reorderKanbanItems(sampleItems, '1', 'status', '__none__')
    const item = reordered.find((i) => i.id === '1')
    expect(item?.properties.status).toBeUndefined()
  })

  it('returns original items if item id is not found', () => {
    const result = reorderKanbanItems(sampleItems, 'non-existent', 'status', 'done')
    expect(result).toEqual(sampleItems)
  })
})

describe('reorderKanbanColumns', () => {
  const sampleColumns: KanbanProperty[] = [
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'in_progress', label: 'In Progress', color: 'blue' },
        { id: 'done', label: 'Done', color: 'green' },
      ],
    },
  ]

  it('reorders options within the specified column', () => {
    const updated = reorderKanbanColumns(sampleColumns, 'status', 'done', 'todo')
    const statusCol = updated.find((c) => c.id === 'status')
    expect(statusCol?.options?.map((o) => o.id)).toEqual(['done', 'todo', 'in_progress'])
  })

  it('returns untouched columns if column or options not found', () => {
    const updated = reorderKanbanColumns(sampleColumns, 'unknown', 'done', 'todo')
    expect(updated).toEqual(sampleColumns)
  })
})
