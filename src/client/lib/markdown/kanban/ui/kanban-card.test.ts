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

function cardCheckbox(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `input[aria-label="${t('preview.kanban_select_card')}"]`,
  )
  if (!el) throw new Error('card checkbox not found')
  return el
}

describe('KanbanCard hover-only header row', () => {
  it('floats the header controls over the card when no tags are shown, reserving no row', () => {
    const { container, dispose } = renderCard(bareCard)
    expect(cardCheckbox(container).closest('.absolute')).not.toBeNull()
    dispose()
  })

  it('keeps the header in flow while the card shows tags', () => {
    const { container, dispose } = renderCard(taggedCard)
    expect(cardCheckbox(container).closest('.absolute')).toBeNull()
    dispose()
  })
})

describe('KanbanGalleryView hover-only header row', () => {
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

  it('floats the checkbox row over the cover when the card has no tags', () => {
    const { container, dispose } = renderGallery([bareCard])
    expect(cardCheckbox(container).closest('.absolute')).not.toBeNull()
    dispose()
  })

  it('keeps the gallery header in flow while the card shows tags', () => {
    const { container, dispose } = renderGallery([taggedCard])
    expect(cardCheckbox(container).closest('.absolute')).toBeNull()
    dispose()
  })
})
