import { describe, expect, it } from 'vitest'
import {
  applyKanbanFilters,
  applyKanbanSorts,
  groupKanbanItems,
  searchKanbanItems,
} from './filter-sort'
import type { KanbanItem, KanbanProperty } from './types'

const items: KanbanItem[] = [
  {
    id: 'item-1',
    title: 'Setup Project',
    properties: {
      status: 'done',
      priority: 'high',
      assignee: 'Alice',
      progress: 100,
      tags: ['init', 'infra'],
    },
  },
  {
    id: 'item-2',
    title: 'Develop Feature A',
    properties: {
      status: 'in_progress',
      priority: 'medium',
      assignee: 'Bob',
      progress: 50,
      tags: ['feature'],
    },
  },
  {
    id: 'item-3',
    title: 'Write Documentation',
    properties: {
      status: 'todo',
      priority: 'low',
      assignee: '',
      progress: 0,
      tags: [],
    },
  },
  {
    id: 'item-4',
    title: 'Fix Bug in Parser',
    properties: {
      status: 'todo',
      priority: 'high',
      assignee: 'Alice',
      tags: ['bug'],
    },
  },
]

describe('applyKanbanFilters equality', () => {
  it('filters with equals and not_equals', () => {
    const eq = applyKanbanFilters(items, [
      { propertyId: 'status', operator: 'equals', value: 'todo' },
    ])
    expect(eq.map((i) => i.id)).toEqual(['item-3', 'item-4'])

    const notEq = applyKanbanFilters(items, [
      { propertyId: 'status', operator: 'not_equals', value: 'todo' },
    ])
    expect(notEq.map((i) => i.id)).toEqual(['item-1', 'item-2'])
  })

  it('filters array values with equals', () => {
    const res = applyKanbanFilters(items, [
      { propertyId: 'tags', operator: 'equals', value: 'bug' },
    ])
    expect(res.map((i) => i.id)).toEqual(['item-4'])
  })
})

describe('applyKanbanFilters text and presence', () => {
  it('filters with contains and not_contains on title', () => {
    const res = applyKanbanFilters(items, [
      { propertyId: 'title', operator: 'contains', value: 'Doc' },
    ])
    expect(res.map((i) => i.id)).toEqual(['item-3'])

    const notRes = applyKanbanFilters(items, [
      { propertyId: 'title', operator: 'not_contains', value: 'Doc' },
    ])
    expect(notRes).toHaveLength(3)
  })

  it('filters with is_empty and is_not_empty', () => {
    const empty = applyKanbanFilters(items, [
      { propertyId: 'assignee', operator: 'is_empty' },
    ])
    expect(empty.map((i) => i.id)).toEqual(['item-3'])

    const nonEmpty = applyKanbanFilters(items, [
      { propertyId: 'assignee', operator: 'is_not_empty' },
    ])
    expect(nonEmpty.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-4'])
  })

  it('combines multiple filters using AND', () => {
    const res = applyKanbanFilters(items, [
      { propertyId: 'status', operator: 'equals', value: 'todo' },
      { propertyId: 'priority', operator: 'equals', value: 'high' },
    ])
    expect(res.map((i) => i.id)).toEqual(['item-4'])
  })
})

describe('applyKanbanSorts', () => {
  it('sorts by title ascending and descending', () => {
    const asc = applyKanbanSorts(items, [{ propertyId: 'title', direction: 'asc' }])
    expect(asc[0]?.title).toBe('Develop Feature A')
    expect(asc.at(-1)?.title).toBe('Write Documentation')

    const desc = applyKanbanSorts(items, [{ propertyId: 'title', direction: 'desc' }])
    expect(desc[0]?.title).toBe('Write Documentation')
    expect(desc.at(-1)?.title).toBe('Develop Feature A')
  })

  it('sorts by numeric progress and handles undefined values', () => {
    const asc = applyKanbanSorts(items, [{ propertyId: 'progress', direction: 'asc' }])
    expect(asc[0]?.id).toBe('item-3')
    expect(asc[1]?.id).toBe('item-2')
    expect(asc[2]?.id).toBe('item-1')
    expect(asc[3]?.id).toBe('item-4')
  })
})

describe('searchKanbanItems', () => {
  it('searches across title and properties case-insensitively', () => {
    expect(searchKanbanItems(items, 'PROJECT').map((i) => i.id)).toEqual(['item-1'])
    expect(searchKanbanItems(items, 'alice').map((i) => i.id)).toEqual(['item-1', 'item-4'])
    expect(searchKanbanItems(items, 'infra').map((i) => i.id)).toEqual(['item-1'])
  })

  it('returns all items when query is empty or spaces', () => {
    expect(searchKanbanItems(items, '')).toEqual(items)
    expect(searchKanbanItems(items, '   ')).toEqual(items)
  })
})

describe('groupKanbanItems', () => {
  const statusColumn: KanbanProperty = {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'in_progress', label: 'In Progress', color: 'blue' },
      { id: 'done', label: 'Done', color: 'green' },
    ],
  }

  it('groups items by their status property', () => {
    const groups = groupKanbanItems(items, 'status', statusColumn)
    expect(groups).toHaveLength(3)

    const todo = groups.find((g) => g.groupKey === 'todo')
    expect(todo?.items.map((i) => i.id)).toEqual(['item-3', 'item-4'])
    const prog = groups.find((g) => g.groupKey === 'in_progress')
    expect(prog?.items.map((i) => i.id)).toEqual(['item-2'])
    const done = groups.find((g) => g.groupKey === 'done')
    expect(done?.items.map((i) => i.id)).toEqual(['item-1'])
  })

  it('adds No Status group when items have missing or unknown status', () => {
    const orphan: KanbanItem = { id: 'item-orphan', title: 'No status item', properties: {} }
    const groups = groupKanbanItems([...items, orphan], 'status', statusColumn)
    const noStatus = groups.find((g) => g.groupKey === '__none__')
    expect(noStatus).toBeDefined()
    expect(noStatus?.items.map((i) => i.id)).toEqual(['item-orphan'])
  })
})
