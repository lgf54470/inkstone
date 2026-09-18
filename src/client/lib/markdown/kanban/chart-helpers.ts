import { t } from '../../i18n'
import type {
  KanbanChartDataset,
  KanbanChartType,
  KanbanData,
  KanbanProperty,
} from './types'

const COLOR_TEXT_DARK = '#94a3b8'
const COLOR_TEXT_LIGHT = '#64748b'
const COLOR_TOOLTIP_BG_DARK = '#1e293b'
const COLOR_TOOLTIP_BG_LIGHT = '#ffffff'
const COLOR_TOOLTIP_TITLE_DARK = '#ffffff'
const COLOR_TOOLTIP_TITLE_LIGHT = '#0f172a'
const COLOR_TOOLTIP_BODY_DARK = '#cbd5e1'
const COLOR_TOOLTIP_BODY_LIGHT = '#334155'
const COLOR_TOOLTIP_BORDER_DARK = '#334155'
const COLOR_TOOLTIP_BORDER_LIGHT = '#e2e8f0'
const COLOR_LINE_BORDER = '#3b82f6'

const DEFAULT_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#64748b',
]

export function resolveOptionColor(colorName?: string, index = 0): string {
  if (!colorName) return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]!
  const map: Record<string, string> = {
    blue: '#3b82f6',
    green: '#10b981',
    yellow: '#eab308',
    orange: '#f97316',
    purple: '#8b5cf6',
    pink: '#ec4899',
    red: '#ef4444',
    gray: '#6b7280',
    coral: '#f43f5e',
    teal: '#14b8a6',
    slate: '#64748b',
  }
  return map[colorName] || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]!
}

export function aggregateKanbanChartData(
  items: KanbanData['items'],
  groupBy: string,
  groupByProperty: KanbanProperty | undefined,
): KanbanChartDataset {
  const counts = new Map<string, number>()
  const labels: string[] = []
  const data: number[] = []
  const colors: string[] = []
  const total = items.length

  if (!groupByProperty || !groupByProperty.options || groupByProperty.options.length === 0) {
    const allLabel = t('preview.kanban_chart_all_tasks')
    counts.set(allLabel, total)
    labels.push(allLabel)
    data.push(total)
    colors.push(DEFAULT_PALETTE[0]!)
    return { labels, data, colors, total }
  }

  const propId = groupByProperty.id || groupBy
  for (const item of items) {
    const val = String(item.properties[propId] || '__none__')
    counts.set(val, (counts.get(val) || 0) + 1)
  }

  groupByProperty.options.forEach((opt, idx) => {
    const count = counts.get(opt.id) || counts.get(opt.label) || 0
    labels.push(opt.label)
    data.push(count)
    colors.push(resolveOptionColor(opt.color, idx))
    counts.delete(opt.id)
    counts.delete(opt.label)
  })

  let remaining = 0
  for (const c of counts.values()) remaining += c
  if (remaining > 0) {
    labels.push(t('preview.kanban_chart_no_value'))
    data.push(remaining)
    colors.push(resolveOptionColor('gray', labels.length))
  }

  return { labels, data, colors, total }
}

function buildChartJsOptions(type: KanbanChartType, isDark: boolean) {
  const textColor = isDark ? COLOR_TEXT_DARK : COLOR_TEXT_LIGHT
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
  const isCartesian = type === 'bar' || type === 'line'

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === 'pie' || type === 'doughnut' || type === 'polarArea' || type === 'radar',
        labels: { color: textColor },
      },
      tooltip: {
        backgroundColor: isDark ? COLOR_TOOLTIP_BG_DARK : COLOR_TOOLTIP_BG_LIGHT,
        titleColor: isDark ? COLOR_TOOLTIP_TITLE_DARK : COLOR_TOOLTIP_TITLE_LIGHT,
        bodyColor: isDark ? COLOR_TOOLTIP_BODY_DARK : COLOR_TOOLTIP_BODY_LIGHT,
        borderColor: isDark ? COLOR_TOOLTIP_BORDER_DARK : COLOR_TOOLTIP_BORDER_LIGHT,
        borderWidth: 1,
      },
    },
    scales: isCartesian
      ? {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor } },
        }
      : undefined,
  }
}

export function buildChartJsConfig(
  type: KanbanChartType,
  dataset: KanbanChartDataset,
  isDark: boolean,
) {
  return {
    type,
    data: {
      labels: dataset.labels,
      datasets: [
        {
          label: t('preview.kanban_chart_dataset_tasks'),
          data: dataset.data,
          backgroundColor: type === 'line' ? 'rgba(59, 130, 246, 0.2)' : dataset.colors,
          borderColor: type === 'line' ? COLOR_LINE_BORDER : undefined,
          borderWidth: type === 'line' ? 2 : 0,
          fill: type === 'line',
          tension: 0.3,
        },
      ],
    },
    options: buildChartJsOptions(type, isDark),
  }
}
