import { describe, expect, it } from 'vitest'
import { aggregateKanbanChartData, buildChartJsConfig } from './chart-helpers'
import type { KanbanItem, KanbanProperty } from './types'

describe('aggregateKanbanChartData', () => {
  const statusProp: KanbanProperty = {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'in_progress', label: 'In Progress', color: 'orange' },
      { id: 'done', label: 'Done', color: 'green' },
    ],
  }

  const items: KanbanItem[] = [
    { id: '1', title: 'Task 1', properties: { status: 'todo' } },
    { id: '2', title: 'Task 2', properties: { status: 'in_progress' } },
    { id: '3', title: 'Task 3', properties: { status: 'done' } },
    { id: '4', title: 'Task 4', properties: { status: 'done' } },
  ]

  it('aggregates item counts by property option accurately', () => {
    const res = aggregateKanbanChartData(items, 'status', statusProp)
    expect(res.total).toBe(4)
    expect(res.labels).toContain('To Do')
    expect(res.labels).toContain('In Progress')
    expect(res.labels).toContain('Done')
    const doneIdx = res.labels.indexOf('Done')
    expect(res.data[doneIdx]).toBe(2)
  })

  it('creates valid Chart.js config for bar and pie charts', () => {
    const dataset = aggregateKanbanChartData(items, 'status', statusProp)
    const barConfig = buildChartJsConfig('bar', dataset, false)
    expect(barConfig.type).toBe('bar')
    expect(barConfig.data.labels).toHaveLength(3)

    const pieConfig = buildChartJsConfig('pie', dataset, true)
    expect(pieConfig.type).toBe('pie')
    expect(pieConfig.options.plugins.legend.display).toBe(true)
  })
})
