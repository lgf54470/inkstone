import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanChartView } from './kanban-chart-view'
import type { KanbanData, KanbanItem, KanbanView } from '../types'

interface ChartConfig {
  type: string
  data: { labels: string[]; datasets: Array<{ label: string; backgroundColor: string[] }> }
  options: { plugins: { tooltip: { backgroundColor: string } } }
}

const { chartConfigs, paletteReads } = vi.hoisted(() => ({
  chartConfigs: [] as ChartConfig[],
  paletteReads: { count: 0 },
}))

vi.mock('chart.js/auto', () => ({
  Chart: class MockChart {
    constructor(_canvas: unknown, config: ChartConfig) {
      chartConfigs.push(config)
    }
    destroy() {}
  },
}))

// The real reader asks the document how it resolves each token, which jsdom
// does not do; what matters here is *when* the view reads it and that the
// colours it hands Chart.js come from that read rather than from itself.
vi.mock('../chart-palette', async () => {
  const { KANBAN_COLOR_NAMES } = await import('../colors')
  return {
    readKanbanChartPalette: () => {
      paletteReads.count += 1
      const n = paletteReads.count
      return {
        text: `P${n}-text`,
        grid: `P${n}-grid`,
        tooltipBg: `P${n}-tooltip-bg`,
        tooltipTitle: `P${n}-title`,
        tooltipBody: `P${n}-body`,
        tooltipBorder: `P${n}-border`,
        lineBorder: `P${n}-line`,
        lineFill: `P${n}-line-fill`,
        tagColors: Object.fromEntries(KANBAN_COLOR_NAMES.map((name) => [name, `P${n}-${name}`])),
      }
    },
  }
})

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
  paletteReads.count = 0
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
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
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-accent')
  }
  return { container, render, unmount }
}

async function flushCharts() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
}

async function flipAttribute(name: string, value: string) {
  await act(async () => {
    document.documentElement.setAttribute(name, value)
    await Promise.resolve()
  })
  await flushCharts()
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

describe('KanbanChartView palette following', () => {
  it('paints the slices with the colours of the palette it read', async () => {
    const { render, unmount } = setup()
    render(makeData())
    await flushCharts()
    expect(paletteReads.count).toBe(1)
    expect(chartConfigs[0]!.data.datasets[0]!.backgroundColor).toEqual(['P1-gray', 'P1-blue'])
    unmount()
  })

  it('repaints with a freshly read palette when data-theme flips', async () => {
    const { render, unmount } = setup()
    render(makeData())
    await flushCharts()
    const lightTip = chartConfigs[0]!.options.plugins.tooltip.backgroundColor

    await flipAttribute('data-theme', 'dark')
    expect(chartConfigs).toHaveLength(2)
    expect(chartConfigs[1]!.options.plugins.tooltip.backgroundColor).not.toBe(lightTip)
    expect(chartConfigs[1]!.data.datasets[0]!.backgroundColor).toEqual(['P2-gray', 'P2-blue'])
    unmount()
  })

  it('repaints when only the accent changes, because the line chart follows it', async () => {
    const { render, unmount } = setup()
    render(makeData())
    await flushCharts()

    await flipAttribute('data-accent', 'indigo')
    expect(chartConfigs).toHaveLength(2)
    expect(chartConfigs[1]!.data.datasets[0]!.backgroundColor).toEqual(['P2-gray', 'P2-blue'])
    unmount()
  })

  it('reuses one palette across data changes until the theme moves', async () => {
    const { render, unmount } = setup()
    const data = makeData()
    render(data)
    await flushCharts()
    render({ ...data, items: [...items, { id: '4', title: 'd', properties: { status: 'doing' } }] })
    await flushCharts()
    expect(chartConfigs).toHaveLength(2)
    expect(paletteReads.count).toBe(1)
    unmount()
  })
})

describe('KanbanChartView i18n', () => {
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
