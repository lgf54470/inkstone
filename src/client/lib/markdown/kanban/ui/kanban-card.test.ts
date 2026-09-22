import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initI18n, t } from '../../../i18n'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'
import { KanbanCard } from './kanban-card'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanListView } from './kanban-list-view'

/**
 * SH-107's shape, asked of the mounted card rather than of its source: the card is a container of
 * controls and its title is the control that opens the detail. The three views draw the same card,
 * so they are asserted together — the board's card, the gallery's tile and the list's row — because
 * a card surface that drifts back to being one click target is what the raw-control guard, axe's
 * `nested-interactive` and this test are all watching for.
 */
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  await initI18n()
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function mount(element: ReturnType<typeof createElement>): void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(element)
  })
}

const item: KanbanItem = {
  id: 'card-1',
  title: 'First card',
  properties: { status: 'todo', tags: ['probe'] },
  subtasks: [{ id: 'sub-1', title: 'One', completed: false }],
}

const columns: KanbanProperty[] = [
  { id: 'title', name: 'Title', type: 'title' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [{ id: 'todo', label: 'To Do', color: 'gray' }],
  },
  {
    id: 'tags',
    name: 'Tags',
    type: 'multi-select',
    options: [{ id: 'probe', label: 'Probe', color: 'blue' }],
  },
]

function cardProps(onOpenDetail: (item: KanbanItem) => void, overrides: Record<string, unknown> = {}) {
  return {
    item,
    columns,
    isSelected: false,
    onToggleSelect: vi.fn(),
    onOpenDetail,
    onUpdateTitle: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onMoveColumn: vi.fn(),
    ...overrides,
  }
}

/** The board's card. */
function mountCard(overrides: Record<string, unknown> = {}) {
  const onOpenDetail = vi.fn()
  mount(createElement(KanbanCard, cardProps(onOpenDetail, overrides)))
  return { onOpenDetail, card: document.querySelector<HTMLElement>('[data-item-id="card-1"]')! }
}

function titleButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button`)!
}

function press(target: Element, key: string, altKey = false): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true }))
  })
}

describe('the kanban card is a container whose title opens the detail', () => {
  it('draws no control of its own around the controls it holds', () => {
    const { card } = mountCard()
    expect(card.getAttribute('role')).toBeNull()
    expect(card.getAttribute('tabindex')).toBeNull()
    expect(card.querySelectorAll('[role="button"]').length).toBe(0)
  })

  it('opens the detail from its title, which is a real button', () => {
    const { onOpenDetail, card } = mountCard()
    const title = card.querySelector('h3 button') as HTMLButtonElement
    expect(title.textContent).toBe(item.title)
    expect(title.getAttribute('type')).toBe('button')
    act(() => title.click())
    expect(onOpenDetail).toHaveBeenCalledWith(item)
  })

  it('lets its own controls act without opening the detail', () => {
    const onToggleSelect = vi.fn()
    const { onOpenDetail, card } = mountCard({ onToggleSelect })
    const select = card.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(select.getAttribute('aria-label')).toBe(t('preview.kanban_select_card'))
    act(() => select.click())
    expect(onToggleSelect).toHaveBeenCalledWith(item.id)
    expect(onOpenDetail).not.toHaveBeenCalled()
  })

  it('keeps the column shortcut, read off the card from the control that was pressed', () => {
    const onMoveColumn = vi.fn()
    mountCard({ onMoveColumn })
    press(titleButton(), 'ArrowRight', true)
    expect(onMoveColumn).toHaveBeenCalledWith(item.id, 'next')
    press(titleButton(), 'ArrowLeft', true)
    expect(onMoveColumn).toHaveBeenCalledWith(item.id, 'prev')
    press(titleButton(), 'ArrowRight')
    expect(onMoveColumn).toHaveBeenCalledTimes(2)
  })

})

describe('the two other views draw the same card', () => {
  it('draws the gallery tile as the same card', () => {
    const onOpenDetail = vi.fn()
    mount(createElement(KanbanGalleryView, { data: data(), selectedIds: new Set<string>(), onToggleSelect: vi.fn(), onOpenDetail, onAddItem: vi.fn() }))
    expect(document.querySelector('[data-item-id="card-1"][role]')).toBeNull()
    const title = document.querySelector('[data-item-id="card-1"] h3 button') as HTMLButtonElement
    expect(title.textContent).toBe(item.title)
    act(() => title.click())
    expect(onOpenDetail).toHaveBeenCalledWith(item)
  })

  it('draws the list row as the same card', () => {
    const onOpenDetail = vi.fn()
    mount(createElement(KanbanListView, { data: data(), selectedIds: new Set<string>(), onToggleSelect: vi.fn(), onOpenDetail, onAddItem: vi.fn() }))
    expect(document.querySelector('[data-item-id="card-1"][role]')).toBeNull()
    // The row leads with a subtask toggle and a selection box, so the title is found by what it says.
    const titles = [...document.querySelectorAll('[data-item-id="card-1"] button')].filter((button) => button.textContent === item.title)
    expect(titles.length).toBe(1)
    act(() => (titles[0] as HTMLButtonElement).click())
    expect(onOpenDetail).toHaveBeenCalledWith(item)
  })
})

function data(): KanbanData {
  return {
    title: 'Board',
    columns,
    views: [{ id: 'view-board', name: '', type: 'board', groupBy: 'status' }],
    items: [item],
  }
}
