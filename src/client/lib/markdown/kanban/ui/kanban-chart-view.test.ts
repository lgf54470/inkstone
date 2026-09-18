import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanChartView } from './kanban-chart-view'
import type { KanbanData, KanbanItem, KanbanView } from '../types'

interface ChartConfig {
  type: string
  data: { labels: string[]; datasets: Array<{ label: string }> }
  options: { plugins: { tooltip: { backgroundColor: string } } }
}

const { chartConfigs } = vi.hoisted(() => ({ chartConfigs: [] as ChartConfig[] }))

vi.mock('chart.js/auto', () => ({
  Chart: class MockChart {
    constructor(_canvas: unknown, config: ChartConfig) {
      chartConfigs.push(config)
    }
    destroy() {}
  },
}))

beforeAll(async () => {
  await initI18n()
})

const chartView: KanbanView = {
  id: 'v',
  name: 'Chart',
  type: 'chart',
  chartType: 'bar',
  chartGroupBy: 'status',
}

const items: KanbanItem[] = [
  { id: '1', title: 'a', properties: { status: 'todo' } },
  { id: '2', title: 'b', properties: { status: 'todo' } },
  { id: '3', title: 'c', properties: { status: 'doing' } },
]

function makeData(): KanbanData {
  return {
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
    items,
    views: [chartView],
  }
}

function setup() {
  installTestGlobals()
  chartConfigs.length = 0
  document.documentElement.removeAttribute('data-theme')
  const onUpdateView = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  const render = (data: KanbanData) => {
    act(() => { root.render(createElement(KanbanChartView, { data, view: chartView, onUpdateView })) })
  }
  const unmount = () => {
    act(() => { root.unmount() })
    container.remove()
  }
  return { container, render, unmount }
}

async function flushCharts() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
}

describe('KanbanChartView chart lifecycle', () => {
  it('keeps the chart instance when an unrelated field commits with the same items', async () => {
    const { render, unmount } = setup()
    const data = makeData()
    render(data)
    await flushCharts()
    expect(chartConfigs).toHaveLength(1)

    render({ ...data, title: 'renamed while typing elsewhere' })
    await flushCharts()
    expect(chartConfigs).toHaveLength(1)
    unmount()
  })

  it('rebuilds the dataset when the items themselves change', async () => {
    const { render, unmount } = setup()
    const data = makeData()
    render(data)
    await flushCharts()
    render({ ...data, items: [...items, { id: '4', title: 'd', properties: { status: 'doing' } }] })
    await flushCharts()
    expect(chartConfigs).toHaveLength(2)
    unmount()
  })
})

describe('KanbanChartView theme and i18n', () => {
  it('repaints with dark colors when data-theme flips', async () => {
    const { render, unmount } = setup()
    render(makeData())
    await flushCharts()
    const lightTip = chartConfigs[0]!.options.plugins.tooltip.backgroundColor

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark')
      await Promise.resolve()
    })
    await flushCharts()
    expect(chartConfigs).toHaveLength(2)
    const darkTip = chartConfigs[1]!.options.plugins.tooltip.backgroundColor
    expect(darkTip).not.toBe(lightTip)
    document.documentElement.removeAttribute('data-theme')
    unmount()
  })

  it('labels the dataset through i18n instead of a hardcoded string', async () => {
    const { render, unmount } = setup()
    render(makeData())
    await flushCharts()
    expect(chartConfigs[0]!.data.datasets[0]!.label).toBe(t('preview.kanban_chart_dataset_tasks'))
    unmount()
  })
})

describe('KanbanChartView accessibility', () => {
  it('gives the canvas an image role and a readable summary', async () => {
    const { container, render, unmount } = setup()
    render(makeData())
    await flushCharts()
    const canvas = container.querySelector('canvas')!
    expect(canvas.getAttribute('role')).toBe('img')
    const label = canvas.getAttribute('aria-label') ?? ''
    expect(label).toContain('3')
    expect(label).toContain('To Do: 2')
    expect(label).toContain('Doing: 1')
    unmount()
  })

  it('gives the group-by select an accessible name', async () => {
    const { container, render, unmount } = setup()
    render(makeData())
    await flushCharts()
    const select = container.querySelector('select')!
    expect(select.getAttribute('aria-label')).toBe(t('preview.kanban_chart_group_by'))
    unmount()
  })
})
