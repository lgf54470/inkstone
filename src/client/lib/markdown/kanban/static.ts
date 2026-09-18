/**
 * A board as a still list, for every surface that serializes or prints its markup: an exported
 * document, a shared note, a slide, a link hover card, the editor's live preview. Those channels
 * cannot host a live board — a React root there would outlive the page it was drawn for, and every
 * control on it would be a button nobody can press — so the cards travel as the list the fence
 * describes. Grouping follows the board's own group column; the view's filters are deliberately not
 * applied, because a still has no control that could tell the reader it is looking at a subset.
 */
import { t } from '../../i18n'
import { parseKanbanBody } from './body'
import { groupKanbanItems, type KanbanGroup } from './filter-sort'
import { formatKanbanGroupLabel } from './i18n-helpers'
import type { KanbanData, KanbanItem } from './types'
import { kanbanBody, kanbanBlocks, kanbanPlaceholder, markKanbanReady, removeKanbanLiveControls, showKanbanError } from './view'

function snapshotGroups(data: KanbanData): KanbanGroup[] {
  const activeView = data.views.find((view) => view.id === data.activeViewId)
  const groupBy = activeView?.groupBy || 'status'
  const groupProperty = data.columns.find((column) => column.id === groupBy)
  return groupKanbanItems(data.items, groupBy, groupProperty).filter((group) => group.items.length > 0)
}

function cardList(items: KanbanItem[]): HTMLUListElement {
  const list = document.createElement('ul')
  list.className = 'kanban-snapshot-cards'
  for (const item of items) {
    const card = document.createElement('li')
    card.className = 'kanban-snapshot-card'
    card.textContent = item.title
    list.append(card)
  }
  return list
}

function groupList(groups: KanbanGroup[]): HTMLElement {
  const list = document.createElement('dl')
  list.className = 'kanban-snapshot-groups'
  for (const group of groups) {
    const name = document.createElement('dt')
    name.className = 'kanban-snapshot-group'
    name.textContent = formatKanbanGroupLabel(group.groupKey, group.label)
    const cards = document.createElement('dd')
    cards.className = 'kanban-snapshot-group-cards'
    cards.append(cardList(group.items))
    list.append(name, cards)
  }
  return list
}

function emptyNote(): HTMLElement {
  const empty = document.createElement('p')
  empty.className = 'kanban-snapshot-empty'
  empty.textContent = t('preview.kanban_snapshot_empty')
  return empty
}

function titleNote(title: string): HTMLElement {
  const node = document.createElement('p')
  node.className = 'kanban-snapshot-title'
  node.textContent = title
  return node
}

function snapshotNode(data: KanbanData): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'kanban-snapshot'
  wrap.dataset.kanbanSnapshot = '1'
  const groups = snapshotGroups(data)
  if (data.title)
    wrap.append(titleNote(data.title))
  wrap.append(groups.length > 0 ? groupList(groups) : emptyNote())
  return wrap
}

function drawSnapshot(node: HTMLElement, data: KanbanData): void {
  const placeholder = kanbanPlaceholder(node) ?? node
  placeholder.replaceChildren(snapshotNode(data))
  markKanbanReady(node)
}

function drawBlock(node: HTMLElement): void {
  const parsed = parseKanbanBody(kanbanBody(node))
  if (!parsed.ok)
    showKanbanError(node, parsed.error)
  else
    drawSnapshot(node, parsed.data)
  removeKanbanLiveControls(node)
}

/** Draws every kanban block in `root` as a still list instead of a board that never arrives. */
export function renderStaticKanbans(root: ParentNode): void {
  kanbanBlocks(root).forEach(drawBlock)
}
