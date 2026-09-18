import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
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

function titleInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(
    `input[placeholder="${t('preview.kanban_card_title')}"]`,
  )
  if (!el) throw new Error('title input not found')
  return el
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderDetail(nextItem: KanbanItem | null) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const p = propsFor(nextItem)
  act(() => root.render(createElement(KanbanItemDetail, p)))
  return {
    props: p,
    rerender(next: KanbanItem | null) {
      act(() => root.render(createElement(KanbanItemDetail, propsFor(next))))
    },
    dispose() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function pressKey(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('KanbanItemDetail title draft commit', () => {
  it('keeps typing local and commits once on Enter', () => {
    const view = renderDetail(item)
    const input = titleInput()
    act(() => { typeInto(input, 'Draft A'); typeInto(input, 'Draft AB') })
    expect(view.props.onUpdate).not.toHaveBeenCalled()
    act(() => { pressKey(input, 'Enter') })
    expect(view.props.onUpdate).toHaveBeenCalledTimes(1)
    expect(view.props.onUpdate.mock.calls[0][0]).toMatchObject({ title: 'Draft AB' })
    view.dispose()
  })

  it('commits the draft on blur and discards it on Escape', () => {
    const view = renderDetail(item)
    const input = titleInput()
    act(() => {
      typeInto(input, 'Blurred')
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(view.props.onUpdate).toHaveBeenCalledTimes(1)
    expect(view.props.onUpdate.mock.calls[0][0]).toMatchObject({ title: 'Blurred' })
    act(() => { typeInto(input, 'Abandoned') })
    act(() => { pressKey(input, 'Escape') })
    expect(view.props.onUpdate).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Blurred')
    view.dispose()
  })

  it('shows the new item title when the detail target changes', () => {
    const view = renderDetail(item)
    act(() => { typeInto(titleInput(), 'Dirty draft') })
    view.rerender({ ...item, id: 'item-2', title: 'External title' })
    expect(titleInput().value).toBe('External title')
    view.dispose()
  })
})

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
