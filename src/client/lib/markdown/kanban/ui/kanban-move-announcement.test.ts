/**
 * Moving a card between columns is the one board action whose result is nowhere but on screen: the
 * drop and the Alt+arrow chord both just re-render the columns, so a screen reader user hears
 * nothing at all and cannot tell which group the card landed in (review #29, K2-03e5). The board
 * therefore carries a polite live region, and both move paths — keyboard and pointer — report
 * through it. These cases pin the three behaviours that make it usable rather than noisy: the
 * region exists before the first move (a live region added at the moment of the change is often not
 * announced), a move that changes the group speaks the item and its new column, and a reorder
 * inside one column stays silent.
 */
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../test-render'
import type { KanbanData } from '../types'
import { KanbanRoot } from './kanban-root'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const data: KanbanData = {
  columns: [
    { id: 'title', name: 'Title', type: 'title' },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'doing', label: 'In Progress', color: 'blue' },
      ],
    },
  ],
  items: [
    { id: 'a', title: 'Design spec', properties: { status: 'todo' } },
    { id: 'b', title: 'Empty ticket', properties: { status: 'doing' } },
  ],
  views: [{ id: 'v-board', name: 'Board', type: 'board', groupBy: 'status' }],
} as KanbanData

const mounted: ReturnType<typeof renderElement>[] = []

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
})

function mountBoard() {
  const rendered = renderElement(createElement(KanbanRoot, { initialData: data, onUpdateData: vi.fn() }))
  mounted.push(rendered)
  return rendered
}

/** Scoped to the board region so the header's own save-status `role="status"` cannot stand in. */
function liveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('[data-kanban-board] [role="status"][aria-live="polite"]')
  expect(region, 'the board renders no polite live region for card moves').not.toBeNull()
  return region!
}

function movedMessage(title: string, group: string): string {
  return t('preview.kanban_moved_to_group', { title, group })
}

function cardOf(itemId: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`)
  expect(card, `card ${itemId} is not in the document`).not.toBeNull()
  return card!
}

/** The chord is pressed on a real control inside the card, which is where keyboard focus lives. */
function pressAltArrowRight(itemId: string, direction: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight'): void {
  const origin = cardOf(itemId).querySelector<HTMLElement>('button') ?? cardOf(itemId)
  origin.focus()
  act(() => {
    origin.dispatchEvent(new KeyboardEvent('keydown', { key: direction, altKey: true, bubbles: true, cancelable: true }))
  })
}

/** What the browser hands the drop handler after a drag started on a card of this board. */
function dropCard(fromId: string, ontoId: string): void {
  const payload = JSON.stringify({ type: 'card', itemId: fromId, sourceGroupKey: 'todo' })
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      getData: (format: string) => (format === 'application/json' ? payload : fromId),
      setData: () => {},
      dropEffect: 'move',
      effectAllowed: 'move',
    },
  })
  const target = cardOf(ontoId)
  act(() => {
    target.dispatchEvent(event)
  })
}

describe('a card move is announced to screen readers', () => {
  it('keeps the live region mounted and empty before anything moves', () => {
    const { container } = mountBoard()
    expect(liveRegion(container).textContent).toBe('')
  })

  it('names the item and its new column after the keyboard move', () => {
    const { container } = mountBoard()
    pressAltArrowRight('a')
    expect(liveRegion(container).textContent).toBe(movedMessage('Design spec', 'In Progress'))
  })

  it('names the destination column after a pointer drop onto another column', () => {
    const { container } = mountBoard()
    dropCard('a', 'b')
    expect(liveRegion(container).textContent).toBe(movedMessage('Design spec', 'In Progress'))
  })

  it('stays silent when the drop only reorders within the same column', () => {
    const { container } = mountBoard()
    dropCard('a', 'a')
    expect(liveRegion(container).textContent).toBe('')
  })

  it('stays silent when the keyboard move has nowhere to go', () => {
    const { container } = mountBoard()
    pressAltArrowRight('a', 'ArrowLeft')
    expect(liveRegion(container).textContent).toBe('')
  })
})
