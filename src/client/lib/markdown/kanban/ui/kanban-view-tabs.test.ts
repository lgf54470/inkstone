import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanViewTabs } from './kanban-view-tabs'
import type { KanbanView } from '../types'

beforeAll(async () => {
  await initI18n()
})

const views: KanbanView[] = [
  { id: 'v-board', name: 'Board', type: 'board' },
  { id: 'v-timeline', name: 'Timeline', type: 'timeline' },
  { id: 'v-gantt', name: 'Gantt', type: 'gantt' },
]

describe('KanbanViewTabs icons', () => {
  it('draws a distinct icon for the timeline and gantt tabs', () => {
    installTestGlobals()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(KanbanViewTabs, { views, activeViewId: 'v-board', onSelectView: vi.fn() }))
    })
    const svgOf = (type: string) =>
      container.querySelector(`button[data-view-type="${type}"] svg`)?.outerHTML
    const timeline = svgOf('timeline')
    const gantt = svgOf('gantt')
    expect(timeline).toBeTruthy()
    expect(gantt).toBeTruthy()
    expect(gantt).not.toBe(timeline)
    expect(gantt).toMatch(/gantt/i)
    act(() => root.unmount())
    container.remove()
  })
})
