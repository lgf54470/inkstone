import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanCard } from './kanban-card'
import { KanbanGalleryView } from './kanban-gallery-view'
import type { KanbanItem, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

const columns: KanbanProperty[] = [
  {
    id: 'tags',
    name: 'Tags',
    type: 'multi-select',
    options: [{ id: 'bug', label: 'Bug', color: 'red' }],
  },
]

const bareCard: KanbanItem = { id: 'c-1', title: 'No tags', properties: {} }
const taggedCard: KanbanItem = { id: 'c-2', title: 'With tags', properties: { tags: ['bug'] } }

function renderCard(item: KanbanItem) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(KanbanCard, {
        item,
        columns,
        isSelected: false,
        onToggleSelect: vi.fn(),
        onOpenDetail: vi.fn(),
        onUpdateTitle: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
      })
    )
  })
  return {
    container,
    dispose() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderGallery(items: KanbanItem[]) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(KanbanGalleryView, {
        data: { views: [], columns, items },
        selectedIds: new Set<string>(),
        onToggleSelect: vi.fn(),
        onOpenDetail: vi.fn(),
        onAddItem: vi.fn(),
      })
    )
  })
  return {
    container,
    dispose() {
      act(() => root.unmount())
      container.remove()
    },
  }
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
  const memberCard: KanbanItem = { id: 'c-3', title: 'Owned', properties: { assignee: 'Nora' } }

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
