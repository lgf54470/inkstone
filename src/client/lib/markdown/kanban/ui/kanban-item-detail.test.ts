import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanItemDetail } from './kanban-item-detail'
import type { KanbanItem, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

const columns: KanbanProperty[] = [
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [{ id: 'todo', label: 'To Do', color: 'gray' }],
  },
]

const item: KanbanItem = {
  id: 'item-1',
  title: 'Detail target',
  properties: { status: 'todo' },
  subtasks: [{ id: 'sub-1', title: 'Step', completed: false }],
}

function propsFor(nextItem: KanbanItem | null) {
  return {
    item: nextItem,
    columns,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onConvertSubtask: vi.fn(),
    onAddColumnOption: vi.fn(),
  }
}

describe('KanbanItemDetail open/close cycles', () => {
  it('toggling item null -> item -> null -> item logs no React hook-order errors', () => {
    installTestGlobals()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      for (const nextItem of [null, item, null, item]) {
        act(() => {
          root.render(createElement(KanbanItemDetail, propsFor(nextItem)))
        })
      }
      const hookErrors = errorSpy.mock.calls
        .map((args) => args.map(String).join(' '))
        .filter((msg) => /Internal React error|hook/i.test(msg))
      expect(hookErrors).toEqual([])
    } finally {
      errorSpy.mockRestore()
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('renders the detail body when an item is present', () => {
    installTestGlobals()
    const rendered = { container: document.createElement('div') }
    document.body.appendChild(rendered.container)
    const root = createRoot(rendered.container)
    act(() => {
      root.render(createElement(KanbanItemDetail, propsFor(item)))
    })
    expect(document.body.textContent).toContain('Subtasks')
    const titleInputs = () =>
      Array.from(document.querySelectorAll('input')).map((el) => (el as HTMLInputElement).value)
    expect(titleInputs()).toContain('Detail target')
    act(() => {
      root.render(createElement(KanbanItemDetail, propsFor(null)))
    })
    expect(document.body.textContent).not.toContain('Subtasks')
    act(() => {
      root.unmount()
    })
    rendered.container.remove()
  })
})
