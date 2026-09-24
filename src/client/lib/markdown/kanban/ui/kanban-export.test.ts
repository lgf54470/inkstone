/**
 * KU-24's wiring. The rasterizer itself needs a real canvas (jsdom has none), so what is asserted
 * here is the part a reader drives: the header draws the export door next to the CSV door, the
 * panel offers the two exits under accessible names, and the print sheet mounts the live view's
 * markup off-screen — with the live canvas staying where it was, so the board the reader is looking
 * at never blanks while the dialog is up.
 */
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../i18n'
import { installTestGlobals, renderElement } from '../../../test-render'
import type { KanbanData } from '../types'
import { KanbanRoot } from './kanban-root'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const mounted: ReturnType<typeof renderElement>[] = []

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
  document.body.replaceChildren()
})

function boardData(): KanbanData {
  return {
    title: 'Export Board',
    activeViewId: 'view-board',
    columns: [
      { id: 'title', name: 'Title', type: 'title' },
      { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
    ],
    items: [{ id: 'a', title: 'A', properties: { status: 'todo' } }],
    views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
  }
}

function openBoard() {
  const onUpdateData = vi.fn()
  const rendered = renderElement(createElement(KanbanRoot, { initialData: boardData(), onUpdateData }))
  mounted.push(rendered)
  return rendered
}

describe('the export door in the header', () => {
  it('opens a panel naming both exits', () => {
    const { container } = openBoard()
    const trigger = [...container.querySelectorAll('[data-kanban-export]')].at(-1) as HTMLButtonElement | undefined
    if (!trigger) throw new Error('the header drew no export trigger')
    act(() => trigger.click())
    const panel = [...document.body.querySelectorAll('div')].find((d) =>
      [...d.querySelectorAll('button')].some((b) => b.textContent?.includes('Print / PDF')),
    )
    if (!panel) throw new Error('the export panel did not open')
    expect([...panel.querySelectorAll('button')].some((b) => b.textContent?.includes('Save as PNG'))).toBe(true)
    expect([...panel.querySelectorAll('button')].some((b) => b.textContent?.includes('Print / PDF'))).toBe(true)
  })

  it('keeps the print sheet off the live board', async () => {
    const { container } = openBoard()
    const panelBefore = container.querySelector('[role="tabpanel"]')
    expect(panelBefore).not.toBeNull()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const trigger = [...container.querySelectorAll('[data-kanban-export]')].at(-1) as HTMLButtonElement
    act(() => trigger.click())
    const panel = [...document.body.querySelectorAll('div')].find((d) =>
      [...d.querySelectorAll('button')].some((b) => b.textContent?.includes('Print / PDF')),
    )
    if (!panel) throw new Error('the export panel did not open')
    const row = [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Print / PDF'))
    await act(async () => row!.click())
    // The sheet is the view's markup, mounted beside the board — not the live node moved.
    const sheet = document.querySelector('.kanban-print-sheet')
    expect(sheet).not.toBeNull()
    expect(container.querySelector('[role="tabpanel"]')).toBe(panelBefore)
    expect(print).not.toHaveBeenCalled()
    // What it carries is a copy of the view, and a copy at that: the sheet's page draws the view's
    // own tree shape, while the live panel the reader is looking at stays the one on the board.
    const page = sheet!.querySelector('.kanban-print-page')
    expect(page?.querySelector('[data-kanban-view-type]')).not.toBeNull()
    expect(page?.querySelector('[role="tabpanel"]')).not.toBe(panelBefore)
  })
})
