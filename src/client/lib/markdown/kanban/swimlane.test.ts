/**
 * F-10. A swimlane is a second grouping: the columns stay what they are and the cards are also cut
 * into horizontal bands by another field. Both answers have to come out of the same derivation as
 * the plain board, otherwise a card counted in a band and a card counted in a column drift apart —
 * so these cases read the bands back from `groupKanbanItems` behaviour they share with it.
 *
 * The band a card sits in is a fact about the card (it is that field's value), so dropping a card
 * into another band is a write of that field as much as it is a write of the column: one gesture,
 * one step of undo.
 */
import { describe, expect, it } from 'vitest'
import { kanbanSwimlanes, moveKanbanItemToCell } from './swimlane'
import type { KanbanItem, KanbanProperty } from './types'

const ownerColumn: KanbanProperty = {
  id: 'owner',
  name: 'Owner',
  type: 'select',
  options: [
    { id: 'alice', label: 'Alice', color: 'blue' },
    { id: 'bob', label: 'Bob', color: 'green' },
  ],
}

const statusColumn: KanbanProperty = {
  id: 'status',
  name: 'Status',
  type: 'select',
  options: [
    { id: 'todo', label: 'To Do', color: 'gray' },
    { id: 'doing', label: 'In Progress', color: 'blue' },
  ],
}

function card(id: string, properties: Record<string, unknown>): KanbanItem {
  return { id, title: `Card ${id}`, properties }
}

const layout = {
  groupPropertyId: 'status',
  groupProperty: statusColumn,
  lanePropertyId: 'owner',
  laneProperty: ownerColumn,
}

describe('the bands a board cuts itself into', () => {
  it('answers nothing about lanes until the view asks for one field over another', () => {
    expect(kanbanSwimlanes([card('a', { status: 'todo', owner: 'alice' })], { ...layout, lanePropertyId: undefined })).toEqual([])
  })

  it('gives one band per option, in the order the field lists them', () => {
    const bands = kanbanSwimlanes([
      card('b1', { status: 'todo', owner: 'bob' }),
      card('a1', { status: 'todo', owner: 'alice' }),
    ], layout)
    expect(bands.map((band) => band.lane.groupKey)).toEqual(['alice', 'bob'])
    expect(bands.map((band) => band.lane.label)).toEqual(['Alice', 'Bob'])
  })

  it('puts cards nobody owns in an unassigned band, the same column that groups them does', () => {
    const bands = kanbanSwimlanes([
      card('a1', { status: 'todo', owner: 'alice' }),
      card('n1', { status: 'todo' }),
    ], layout)
    const unassigned = bands.find((band) => band.lane.groupKey === '__none__')
    expect(unassigned?.lane.items.map((item) => item.id)).toEqual(['n1'])
  })

  it('reads a band off a label the way the columns read a group', () => {
    const bands = kanbanSwimlanes([card('a1', { status: 'todo', owner: 'ALICE' })], layout)
    expect(bands.find((band) => band.lane.groupKey === 'alice')?.lane.items.map((i) => i.id)).toEqual(['a1'])
  })
})

describe('what each band answers about every column', () => {  it('cuts each band into every column of the board, empty ones included', () => {
    const bands = kanbanSwimlanes([card('a1', { status: 'todo', owner: 'alice' })], layout)
    const alice = bands.find((band) => band.lane.groupKey === 'alice')!
    expect(alice.columns.map((group) => [group.groupKey, group.items.length])).toEqual([
      ['todo', 1],
      ['doing', 0],
    ])
  })

  it('keeps a band rule the column it belongs to set', () => {
    const limited: KanbanProperty = {
      ...statusColumn,
      options: [{ id: 'todo', label: 'To Do', color: 'gray', wipLimit: 1 }, { id: 'doing', label: 'In Progress', color: 'blue' }],
    }
    const bands = kanbanSwimlanes([
      card('a1', { status: 'todo', owner: 'alice' }),
      card('a2', { status: 'todo', owner: 'alice' }),
    ], { ...layout, groupProperty: limited })
    expect(bands[0]!.columns[0]!.wipLimit).toBe(1)
  })

  it('leaves a field that offers no options with a single unassigned band', () => {
    const freeText: KanbanProperty = { id: 'owner', name: 'Owner', type: 'text' }
    const bands = kanbanSwimlanes([card('a1', { status: 'todo', owner: 'alice' })], { ...layout, laneProperty: freeText })
    expect(bands.map((band) => band.lane.groupKey)).toEqual(['__none__'])
  })
})

describe('moving a card into one cell of the grid', () => {
  it('writes the column and the band in one step', () => {
    const next = moveKanbanItemToCell([card('a1', { status: 'todo', owner: 'alice' })], {
      itemId: 'a1',
      cell: { groupKey: 'doing', laneKey: 'bob' },
      layout,
    })
    expect(next[0]!.properties).toEqual({ status: 'doing', owner: 'bob' })
  })

  it('takes a card out of the field when the drop lands it in the unassigned band', () => {
    const next = moveKanbanItemToCell([card('a1', { status: 'todo', owner: 'alice' })], {
      itemId: 'a1',
      cell: { groupKey: 'todo', laneKey: '__none__' },
      layout,
    })
    expect('owner' in next[0]!.properties).toBe(false)
    expect(next[0]!.properties.status).toBe('todo')
  })

  it('leaves the band alone when the board is not cut into bands', () => {
    const next = moveKanbanItemToCell([card('a1', { status: 'todo', owner: 'alice' })], {
      itemId: 'a1',
      cell: { groupKey: 'doing' },
      layout: { ...layout, lanePropertyId: undefined },
    })
    expect(next[0]!.properties).toEqual({ status: 'doing', owner: 'alice' })
  })

  it('does not invent a band value for a field the view never named', () => {
    const next = moveKanbanItemToCell([card('a1', { status: 'todo' })], {
      itemId: 'a1',
      cell: { groupKey: 'doing', laneKey: 'bob' },
      layout: { ...layout, lanePropertyId: undefined },
    })
    expect('owner' in next[0]!.properties).toBe(false)
  })
})

describe('where a card that moved lands within the column it lands in', () => {
  it('still inserts beside the card the drop was anchored to', () => {
    const next = moveKanbanItemToCell([
      card('b1', { status: 'doing', owner: 'bob' }),
      card('b2', { status: 'doing', owner: 'bob' }),
      card('a1', { status: 'todo', owner: 'alice' }),
    ], {
      itemId: 'a1',
      cell: { groupKey: 'doing', laneKey: 'bob' },
      pivot: { itemId: 'b2', position: 'after' },
      layout,
    })
    expect(next.map((item) => item.id)).toEqual(['b1', 'b2', 'a1'])
    expect(next[2]!.properties).toEqual({ status: 'doing', owner: 'bob' })
  })

  it('leaves a card that only changed band standing where it was in its column', () => {
    const next = moveKanbanItemToCell([
      card('a1', { status: 'todo', owner: 'alice' }),
      card('a2', { status: 'todo', owner: 'alice' }),
      card('a3', { status: 'todo', owner: 'alice' }),
    ], { itemId: 'a1', cell: { groupKey: 'todo', laneKey: 'bob' }, layout })
    expect(next.map((item) => item.id)).toEqual(['a1', 'a2', 'a3'])
    expect(next[0]!.properties).toEqual({ status: 'todo', owner: 'bob' })
  })

  it('leaves a card in the no-status column it already sits in when it only changes band', () => {
    const next = moveKanbanItemToCell([
      card('n1', { owner: 'alice' }),
      card('n2', { owner: 'alice' }),
    ], { itemId: 'n1', cell: { groupKey: '__none__', laneKey: 'bob' }, layout })
    expect(next.map((item) => item.id)).toEqual(['n1', 'n2'])
    expect(next[0]!.properties).toEqual({ owner: 'bob' })
  })
})

describe('a drop that touches only one coordinate of the cell', () => {
  it('keeps the band when the drop lands on the column itself', () => {
    const next = moveKanbanItemToCell([card('a1', { status: 'todo', owner: 'alice' })], {
      itemId: 'a1',
      cell: { groupKey: 'doing' },
      layout,
    })
    expect(next[0]!.properties).toEqual({ status: 'doing', owner: 'alice' })
  })

  it('answers with the same list when the card is nowhere to be found', () => {
    const items = [card('a1', { status: 'todo', owner: 'alice' })]
    expect(moveKanbanItemToCell(items, { itemId: 'ghost', cell: { groupKey: 'doing', laneKey: 'bob' }, layout })).toBe(items)
  })
})
