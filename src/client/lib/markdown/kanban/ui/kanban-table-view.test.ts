import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanTableView } from './kanban-table-view'
import type { KanbanData } from '../types'

beforeAll(async () => {
  await initI18n()
})

type TableProps = ComponentProps<typeof KanbanTableView>
type TableHandlers = Pick<
  TableProps,
  'onAddItem' | 'onAddColumn' | 'onUpdateProperty' | 'onUpdateSubtasks' | 'selectedIds'
>

function mountTable(data: KanbanData, handlers: TableHandlers) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      createElement(KanbanTableView, {
        data,
        view: data.views[0],
        onToggleSelect: vi.fn(),
        onToggleAll: vi.fn(),
        onOpenDetail: vi.fn(),
        ...handlers,
      }),
    )
  })
  return {
    container,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

const data: KanbanData = {
  columns: [
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'doing', label: 'Doing', color: 'blue' },
      ],
    },
  ],
  items: [{ id: 'a', title: 'A', properties: { status: 'todo' } }],
  views: [{ id: 'v', name: 'Table', type: 'table', groupBy: 'status' }],
}

function addGroupButton(container: HTMLElement): HTMLButtonElement {
  const label = t('preview.kanban_add_new_group')
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label))
  if (!button) throw new Error(`no button labelled "${label}"`)
  return button
}

describe('KanbanTableView add group', () => {
  it('adds a group option instead of a card', () => {
    const onAddColumn = vi.fn()
    const onAddItem = vi.fn()
    const { container, unmount } = mountTable(data, {
      selectedIds: new Set<string>(),
      onAddItem,
      onAddColumn,
    })
    act(() => { addGroupButton(container).click() })
    expect(onAddColumn).toHaveBeenCalledTimes(1)
    expect(onAddItem).not.toHaveBeenCalled()
    unmount()
  })
})
