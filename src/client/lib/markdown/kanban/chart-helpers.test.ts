import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../i18n'
import { aggregateKanbanChartData, buildChartJsConfig } from './chart-helpers'
import type { KanbanItem, KanbanProperty } from './types'

beforeAll(async () => {
  await initI18n()
})

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

describe('aggregateKanbanChartData', () => {
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

describe('aggregateKanbanChartData fallback labels', () => {
  it('uses the localized all-tasks label when grouping has no options', () => {
    const textProp: KanbanProperty = { id: 'assignee', name: 'Assignee', type: 'text' }
    const res = aggregateKanbanChartData(items, 'assignee', textProp)
    expect(res.labels).toEqual([t('preview.kanban_chart_all_tasks')])
    expect(res.data).toEqual([4])
  })

  it('uses the localized no-value label for values outside the option list', () => {
    const looseItems: KanbanItem[] = [
      { id: '1', title: 'Task 1', properties: { status: 'todo' } },
      { id: '5', title: 'Task 5', properties: { status: 'archived' } },
    ]
    const res = aggregateKanbanChartData(looseItems, 'status', statusProp)
    expect(res.labels.at(-1)).toBe(t('preview.kanban_chart_no_value'))
    expect(res.data.at(-1)).toBe(1)
  })
})
