/**
 * F-10. A board answers one question — which column is this card in. Swimlanes add a second: which
 * band. Both are groupings over the same items, so the bands are derived through the very same
 * `groupKanbanItems` the columns use (option order, id-or-label matching, the unassigned catch-all,
 * and the work-in-progress rule a column carries all come along instead of being re-decided here).
 *
 * A band is a fact about the card — it is that field's value — so dropping a card into another band
 * writes that field, and one gesture stays one step of undo.
 */
import { reorderKanbanItems } from './dnd'
import type { KanbanMovePivot } from './dnd'
import { groupKanbanItems } from './filter-sort'
import type { KanbanGroup } from './filter-sort'
import type { KanbanData, KanbanItem, KanbanProperty, KanbanView } from './types'

/** Where a drop lands: a column of the board, and the band that column is drawn in. */
export interface KanbanBoardCell {
  groupKey: string
  laneKey?: string
}

export interface KanbanBoardLayout {
  groupPropertyId: string
  groupProperty?: KanbanProperty
  lanePropertyId?: string
  laneProperty?: KanbanProperty
}

export interface KanbanSwimlane {
  lane: KanbanGroup
  columns: KanbanGroup[]
}

export interface KanbanCellMove {
  itemId: string
  cell: KanbanBoardCell
  pivot?: KanbanMovePivot
  layout: KanbanBoardLayout
}

/** The band a card with no value in the lane field belongs to, same key the columns use. */
const UNASSIGNED_BAND = '__none__'

/**
 * Identity of one cell of the grid. A column repeats in every band, so a highlight keyed on the
 * column alone would light up the same column in all of them at once.
 */
export function kanbanCellKey(cell: KanbanBoardCell): string {
  return JSON.stringify([cell.laneKey ?? null, cell.groupKey])
}

/**
 * The two groupings the view asked for, read off the columns this board actually has. Both the
 * drawing and the writer use this, so the band a card is dropped into is the band it is drawn in.
 */
export function kanbanBoardLayout(data: KanbanData, view: KanbanView): KanbanBoardLayout {
  const groupPropertyId = view.groupBy || 'status'
  const lanePropertyId = view.swimlaneBy
  return {
    groupPropertyId,
    groupProperty: data.columns.find((column) => column.id === groupPropertyId),
    lanePropertyId,
    laneProperty: lanePropertyId ? data.columns.find((column) => column.id === lanePropertyId) : undefined,
  }
}

/**
 * The slice of one band a column of the board draws. A band that reaches no card in a column has
 * nothing to group there, so it borrows the column's own answer about its label and its rule.
 */
export function kanbanBandColumn(band: KanbanSwimlane, column: KanbanGroup): KanbanGroup {
  return band.columns.find((group) => group.groupKey === column.groupKey) ?? { ...column, items: [] }
}

export function kanbanSwimlanes(items: KanbanItem[], layout: KanbanBoardLayout): KanbanSwimlane[] {
  const { lanePropertyId, groupPropertyId, groupProperty, laneProperty } = layout
  if (!lanePropertyId) return []
  return groupKanbanItems(items, lanePropertyId, laneProperty).map((lane) => ({
    lane,
    columns: groupKanbanItems(lane.items, groupPropertyId, groupProperty),
  }))
}

export function moveKanbanItemToCell(items: KanbanItem[], move: KanbanCellMove): KanbanItem[] {
  const { itemId, cell, pivot, layout } = move
  const laneKey = cell.laneKey
  const lanePropertyId = layout.lanePropertyId
  const cardIndex = items.findIndex((item) => item.id === itemId)
  // A card that is not on the board has no band to write, and handing back a fresh array would
  // make the no-op look like a change worth a step of undo.
  const written = laneKey === undefined || !lanePropertyId || cardIndex === -1
    ? items
    : items.map((item) => (item.id === itemId ? writeBand(item, lanePropertyId, laneKey) : item))
  const card = written[cardIndex]
  // A card that only changed band never left its column, so it keeps its place there — the reorder
  // below would otherwise drop it at the bottom of a column it is still standing in.
  if (!pivot && card && laneKey !== undefined && staysInColumn(card, layout.groupPropertyId, cell.groupKey)) {
    return written
  }
  return reorderKanbanItems(written, itemId, layout.groupPropertyId, cell.groupKey, pivot)
}

/**
 * Whether the card already names this column as its value. Deliberately stricter than the drawing,
 * which also reads a label where the board expects an id: a card that only *looks* misplaced gets the
 * reorder it asked for, which is the previous behaviour, rather than being left in place by mistake.
 */
function staysInColumn(item: KanbanItem, groupPropertyId: string, groupKey: string): boolean {
  const value = item.properties[groupPropertyId]
  return groupKey === UNASSIGNED_BAND ? !value : value === groupKey
}

function writeBand(item: KanbanItem, lanePropertyId: string, laneKey: string): KanbanItem {
  const properties = { ...item.properties }
  if (laneKey === UNASSIGNED_BAND) delete properties[lanePropertyId]
  else properties[lanePropertyId] = laneKey
  return { ...item, properties }
}
