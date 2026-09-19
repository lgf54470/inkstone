/**
 * The view switcher announces itself as a tablist, but a reader who arrives there is still
 * navigating by accident: every tab is its own Tab stop, so crossing three views takes three
 * presses and the arrow keys do nothing, and nothing points from the selected tab to the region
 * it produced — the panel is reachable only by guessing it is further down the page (review #29).
 * The contract here is the one a horizontal tablist has to keep: one roving stop, Arrow/Home/End
 * moving both focus and selection, and `aria-controls` resolving to a real `role='tabpanel'` that
 * names the selected tab back. The pair is only observable from whoever owns the panel, so the
 * last group mounts the whole board rather than the tabs alone.
 */
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../test-render'
import type { KanbanData, KanbanView, KanbanViewType } from '../types'
import { KanbanRoot } from './kanban-root'
import { KanbanViewTabs } from './kanban-view-tabs'

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const VIEW_TYPES: KanbanViewType[] = ['board', 'table', 'list', 'gallery', 'calendar', 'timeline', 'gantt']

const views: KanbanView[] = [
  { id: 'v-board', name: 'Board', type: 'board' },
  { id: 'v-timeline', name: 'Timeline', type: 'timeline' },
  { id: 'v-gantt', name: 'Gantt', type: 'gantt' },
]

const PANEL_ID = 'kanban-view-panel'

const mounted: ReturnType<typeof renderElement>[] = []

function mount(node: Parameters<typeof renderElement>[0]) {
  const rendered = renderElement(node)
  mounted.push(rendered)
  return rendered
}

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
})

function mountTabs(activeViewId: string, onSelectView = vi.fn()) {
  const rendered = mount(
    createElement(KanbanViewTabs, { views, activeViewId, panelId: PANEL_ID, onSelectView }),
  )
  const tabs = [...rendered.container.querySelectorAll<HTMLElement>('[role="tab"]')]
  return { ...rendered, tabs, onSelectView }
}

function press(node: HTMLElement, key: string): void {
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function tabByView(viewId: string, container: ParentNode = document): HTMLButtonElement {
  const tab = container.querySelector<HTMLButtonElement>(`[id$="${viewId}"]`)
  expect(tab, `no tab for view ${viewId}`).not.toBeNull()
  return tab!
}

describe('KanbanViewTabs icons', () => {
  it('draws a distinct icon for the timeline and gantt tabs', () => {
    const { container } = mountTabs('v-board')
    const svgOf = (type: string) =>
      container.querySelector(`button[data-view-type="${type}"] svg`)?.outerHTML
    const timeline = svgOf('timeline')
    const gantt = svgOf('gantt')
    expect(timeline).toBeTruthy()
    expect(gantt).toBeTruthy()
    expect(gantt).not.toBe(timeline)
    expect(gantt).toMatch(/gantt/i)
  })
})

describe('KanbanViewTabs tab order', () => {
  it('keeps the selected tab as the only entry point into the list', () => {
    const { tabs } = mountTabs('v-timeline')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('points every tab at the panel it controls', () => {
    const { tabs } = mountTabs('v-board')
    for (const tab of tabs) expect(tab.getAttribute('aria-controls')).toBe(PANEL_ID)
  })
})

describe('KanbanViewTabs keyboard', () => {
  it('selects and focuses the next tab on ArrowRight, wrapping at the end', () => {
    const { container, onSelectView } = mountTabs('v-gantt')
    const last = tabByView('v-gantt', container)
    last.focus()
    press(last, 'ArrowRight')
    expect(onSelectView).toHaveBeenCalledWith('v-board')
    expect(document.activeElement).toBe(tabByView('v-board', container))
  })

  it('selects and focuses the previous tab on ArrowLeft, wrapping at the start', () => {
    const { container, onSelectView } = mountTabs('v-board')
    const first = tabByView('v-board', container)
    first.focus()
    press(first, 'ArrowLeft')
    expect(onSelectView).toHaveBeenCalledWith('v-gantt')
    expect(document.activeElement).toBe(tabByView('v-gantt', container))
  })

  it('jumps to either end of the list on Home and End', () => {
    const { container, onSelectView } = mountTabs('v-timeline')
    const middle = tabByView('v-timeline', container)
    middle.focus()
    press(middle, 'Home')
    press(document.activeElement as HTMLElement, 'End')
    expect(onSelectView.mock.calls.map((call) => call[0])).toEqual(['v-board', 'v-gantt'])
    expect(document.activeElement).toBe(tabByView('v-gantt', container))
  })

  it('leaves an unrelated key alone', () => {
    const { container, onSelectView } = mountTabs('v-board')
    const first = tabByView('v-board', container)
    first.focus()
    press(first, 'a')
    expect(onSelectView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(first)
  })
})

describe('KanbanViewTabs pointer', () => {
  it('selects the view whose tab is clicked', () => {
    const { container, onSelectView } = mountTabs('v-board')
    const target = tabByView('v-gantt', container)
    act(() => target.click())
    expect(onSelectView).toHaveBeenCalledWith('v-gantt')
  })
})

const boardData: KanbanData = {
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
  items: [{ id: 'a', title: 'Design spec', properties: { status: 'todo' } }],
  views: VIEW_TYPES.map((type) => ({ id: `v-${type}`, name: type, type, groupBy: 'status' })),
}

function mountBoard() {
  return mount(createElement(KanbanRoot, { initialData: boardData, onUpdateData: vi.fn() }))
}

describe('KanbanRoot view panel', () => {
  it('exposes the rendered view as the panel the selected tab controls', () => {
    const { container } = mountBoard()
    const selected = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    expect(selected).not.toBeNull()
    const panel = document.getElementById(selected!.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected!.id)
  })

  it('keeps the panel pointing at the tab the arrow keys moved to', () => {
    const { container } = mountBoard()
    const first = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
    first.focus()
    press(first, 'ArrowRight')
    const nowSelected = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    expect(nowSelected?.textContent).toContain('Table')
    const panel = document.getElementById(nowSelected!.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('aria-labelledby')).toBe(nowSelected!.id)
  })

  it('switches the mounted board to the tab a pointer clicked', () => {
    const { container } = mountBoard()
    const tableTab = container.querySelector<HTMLElement>('[role="tab"][data-view-type="table"]')!
    act(() => tableTab.click())
    const selected = container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    expect(selected?.getAttribute('data-view-type')).toBe('table')
    const panel = document.getElementById(selected!.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected!.id)
  })
})

describe('KanbanRoot view naming', () => {
  // The panel already carries the name of the tab that controls it, and every view used to wrap
  // itself in a named region holding the very same string — a reader entering one view heard it
  // twice. The rest of the app has no such inner landmark (its only other tab surface, the markdown
  // tabs block, names the panel and stops there), so the panel is the one named container.
  it.each(VIEW_TYPES)('the %s view leaves the naming to the panel its tab controls', (type) => {
    const { container } = mountBoard()
    const tab = container.querySelector<HTMLElement>(`[role="tab"][data-view-type="${type}"]`)
    expect(tab, `no tab for the ${type} view`).not.toBeNull()
    act(() => {
      tab!.click()
    })
    const selected = container.querySelector<HTMLElement>(`[role="tab"][data-view-type="${type}"][aria-selected="true"]`)
    expect(selected, `clicking the ${type} tab did not select it`).not.toBeNull()

    const panel = document.getElementById(selected!.getAttribute('aria-controls')!)
    expect(panel?.getAttribute('role'), 'the container the tab controls is no longer the panel').toBe('tabpanel')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected!.id)
    expect(panel?.firstElementChild, `the ${type} view mounted nothing`).not.toBeNull()
    expect(panel?.querySelectorAll('[role="region"]').length, 'a view named itself again inside the panel').toBe(0)
  })
})
