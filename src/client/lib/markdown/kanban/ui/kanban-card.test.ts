import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../i18n'
import { installTestGlobals } from '../../../test-render'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'
import { KanbanCard } from './kanban-card'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanListView } from './kanban-list-view'

beforeAll(async () => {
  await initI18n()
})

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
    options: [
      { id: 'bug', label: 'Bug', color: 'red' },
      { id: 'probe', label: 'Probe', color: 'blue' },
    ],
  },
]

const bareCard: KanbanItem = { id: 'c-1', title: 'No tags', properties: {} }
const taggedCard: KanbanItem = { id: 'c-2', title: 'With tags', properties: { tags: ['bug'] } }
const memberCard: KanbanItem = { id: 'c-3', title: 'Owned', properties: { assignee: 'Nora' } }
/** The card the shape assertions read: a status, tags and one subtask, like a board's own. */
const shapeCard: KanbanItem = {
  id: 'card-1',
  title: 'First card',
  properties: { status: 'todo', tags: ['probe'] },
  subtasks: [{ id: 'sub-1', title: 'One', completed: false }],
}

/**
 * One mount for every case in this file, through the same test globals the other component tests
 * install: the card's own shape, the row it reveals on hover, the member it shows, and the two other
 * views that draw the same card.
 */
function mount(element: ReturnType<typeof createElement>) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return {
    container,
    dispose() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function cardProps(
  item: KanbanItem,
  onOpenDetail: (item: KanbanItem) => void,
  overrides: Record<string, unknown> = {},
) {
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

function renderCard(item: KanbanItem = bareCard, overrides: Record<string, unknown> = {}) {
  const onOpenDetail = vi.fn()
  const mounted = mount(createElement(KanbanCard, cardProps(item, onOpenDetail, overrides)))
  return { ...mounted, card: mounted.container.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`)!, onOpenDetail }
}

function galleryData(items: KanbanItem[]): KanbanData {
  return {
    title: 'Board',
    columns,
    views: [{ id: 'view-board', name: '', type: 'board', groupBy: 'status' }],
    items,
  }
}

function renderGallery(items: KanbanItem[]) {
  const onOpenDetail = vi.fn()
  const mounted = mount(
    createElement(KanbanGalleryView, {
      data: galleryData(items),
      selectedIds: new Set<string>(),
      onToggleSelect: vi.fn(),
      onOpenDetail,
      onAddItem: vi.fn(),
    }),
  )
  return { ...mounted, onOpenDetail }
}

function renderList(items: KanbanItem[]) {
  const onOpenDetail = vi.fn()
  const mounted = mount(
    createElement(KanbanListView, {
      data: galleryData(items),
      selectedIds: new Set<string>(),
      onToggleSelect: vi.fn(),
      onOpenDetail,
      onAddItem: vi.fn(),
    }),
  )
  return { ...mounted, onOpenDetail }
}

function press(target: Element, key: string, shiftKey = false): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
}

/** The only `role=img` a card or a gallery tile draws is the one standing for a person. */
function avatarOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="img"]')
}

function cardCheckbox(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `input[aria-label="${t('preview.kanban_select_card')}"]`,
  )
  if (!el) throw new Error('card checkbox not found')
  return el
}

/**
 * SH-107's shape, asked of the mounted card rather than of its source: the card is a container of
 * controls and its title is the control that opens the detail. The three views draw the same card,
 * so they are asserted together — the board's card, the gallery's tile and the list's row — because
 * a card surface that drifts back to being one click target is what the raw-control guard, axe's
 * `nested-interactive` and this test are all watching for.
 */
describe('the kanban card is a container whose title opens the detail', () => {
  it('draws no control of its own around the controls it holds', () => {
    const { card } = renderCard(shapeCard)
    expect(card.getAttribute('role')).toBeNull()
    expect(card.getAttribute('tabindex')).toBeNull()
    expect(card.querySelectorAll('[role="button"]').length).toBe(0)
  })

  it('opens the detail from its title, which is a real button', () => {
    const { card, onOpenDetail, dispose } = renderCard(shapeCard)
    const title = card.querySelector('h3 button') as HTMLButtonElement
    expect(title.textContent).toBe(shapeCard.title)
    expect(title.getAttribute('type')).toBe('button')
    act(() => title.click())
    expect(onOpenDetail).toHaveBeenCalledWith(shapeCard)
    dispose()
  })

  it('lets its own controls act without opening the detail', () => {
    const onToggleSelect = vi.fn()
    const { card, onOpenDetail, dispose } = renderCard(shapeCard, { onToggleSelect })
    const select = card.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(select.getAttribute('aria-label')).toBe(t('preview.kanban_select_card'))
    act(() => select.click())
    expect(onToggleSelect).toHaveBeenCalledWith(shapeCard.id)
    expect(onOpenDetail).not.toHaveBeenCalled()
    dispose()
  })

  it('keeps the column shortcut, read off the card from the control that was pressed', () => {
    const onMoveColumn = vi.fn()
    const { card, dispose } = renderCard(shapeCard, { onMoveColumn })
    const title = card.querySelector('h3 button') as HTMLButtonElement
    press(title, 'ArrowRight', true)
    expect(onMoveColumn).toHaveBeenCalledWith(shapeCard.id, 'next')
    press(title, 'ArrowLeft', true)
    expect(onMoveColumn).toHaveBeenCalledWith(shapeCard.id, 'prev')
    press(title, 'ArrowRight')
    expect(onMoveColumn).toHaveBeenCalledTimes(2)
    dispose()
  })
})

describe('the two other views draw the same card', () => {
  it('draws the gallery tile as the same card', () => {
    const { container, onOpenDetail, dispose } = renderGallery([shapeCard])
    expect(container.querySelector(`[data-item-id="${shapeCard.id}"][role]`)).toBeNull()
    const title = container.querySelector(`[data-item-id="${shapeCard.id}"] h3 button`) as HTMLButtonElement
    expect(title.textContent).toBe(shapeCard.title)
    act(() => title.click())
    expect(onOpenDetail).toHaveBeenCalledWith(shapeCard)
    dispose()
  })

  it('draws the list row as the same card', () => {
    const { container, onOpenDetail, dispose } = renderList([shapeCard])
    expect(container.querySelector(`[data-item-id="${shapeCard.id}"][role]`)).toBeNull()
    // The row leads with a subtask toggle and a selection box, so the title is found by what it says.
    const titles = [...container.querySelectorAll(`[data-item-id="${shapeCard.id}"] button`)].filter(
      (button) => button.textContent === shapeCard.title,
    )
    expect(titles.length).toBe(1)
    act(() => (titles[0] as HTMLButtonElement).click())
    expect(onOpenDetail).toHaveBeenCalledWith(shapeCard)
    dispose()
  })
})

/**
 * The row the card reveals on hover — its checkbox, its tag control and its details button — lives in
 * the card's own flow whether or not the card has tags. It used to be taken out of flow and floated
 * over the card's top edge when there were none, which painted the tag control across the title the
 * moment a reader hovered it (the board draws the same card outside the note, where no prose margin
 * separates the two). A class cannot prove the two boxes do not meet — the browser gate measures that
 * on the running board — so this pins the structure the geometry depends on. The gallery's own tile is
 * the one exception, and it is asserted below: it may float the row, but only over a cover.
 */
describe('KanbanCard hover-only header row', () => {
  it('keeps the header in flow while the card shows no tags', () => {
    const { container, dispose } = renderCard(bareCard)
    const row = cardCheckbox(container).closest('div')!
    expect(row.closest('.absolute')).toBeNull()
    expect(row.contains(container.querySelector('h3'))).toBe(false)
    dispose()
  })

  it('keeps the header in flow while the card shows tags', () => {
    const { container, dispose } = renderCard(taggedCard)
    const row = cardCheckbox(container).closest('div')!
    expect(row.closest('.absolute')).toBeNull()
    dispose()
  })
})

describe('the member an assignee row shows', () => {
  it('names a card avatar with the whole name, not with the two letters it shows', () => {
    const { container, dispose } = renderCard(memberCard)
    expect(avatarOf(container)?.getAttribute('aria-label')).toBe('Nora')
    expect(avatarOf(container)?.textContent).toBe('NO')
    dispose()
  })

  it('draws no avatar on a card nobody is assigned to', () => {
    const { container, dispose } = renderCard(bareCard)
    expect(avatarOf(container)).toBeNull()
    dispose()
  })

  it('names the gallery footer avatar the same way', () => {
    const { container, dispose } = renderGallery([memberCard])
    expect(avatarOf(container)?.getAttribute('aria-label')).toBe('Nora')
    dispose()
  })
})

describe('KanbanGalleryView hover-only header row', () => {
  it('floats the checkbox row over the cover when the tile has one and no tags', () => {
    const { container, dispose } = renderGallery([{ ...bareCard, cover: 'https://example.test/cover.png' }])
    expect(cardCheckbox(container).closest('.absolute')).not.toBeNull()
    dispose()
  })

  it('keeps the checkbox row in flow when the tile has no cover to float it over', () => {
    const { container, dispose } = renderGallery([bareCard])
    expect(cardCheckbox(container).closest('.absolute')).toBeNull()
    dispose()
  })

  it('keeps the gallery header in flow while the card shows tags', () => {
    const { container, dispose } = renderGallery([taggedCard])
    expect(cardCheckbox(container).closest('.absolute')).toBeNull()
    dispose()
  })
})
