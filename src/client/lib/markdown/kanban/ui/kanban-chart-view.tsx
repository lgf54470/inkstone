import { useEffect, useRef, useState } from 'react'
import {
  BarChart2,
  CheckCircle2,
  CircleDot,
  Compass,
  Layers,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
} from 'lucide-react'
import { t } from '../../../i18n'
import { aggregateKanbanChartData, buildChartJsConfig } from '../chart-helpers'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanChartType, KanbanData, KanbanView } from '../types'

interface KanbanChartViewProps {
  data: KanbanData
  view: KanbanView
  onUpdateView?: (patch: Partial<KanbanView>) => void
}

const CHART_TYPES: Array<{ type: KanbanChartType; labelKey: string; icon: React.ComponentType<{ size?: number }> }> = [
  { type: 'bar', labelKey: 'preview.kanban_chart_bar', icon: BarChart2 },
  { type: 'line', labelKey: 'preview.kanban_chart_line', icon: LineChartIcon },
  { type: 'pie', labelKey: 'preview.kanban_chart_pie', icon: PieChartIcon },
  { type: 'doughnut', labelKey: 'preview.kanban_chart_doughnut', icon: CircleDot },
  { type: 'polarArea', labelKey: 'preview.kanban_chart_polar_area', icon: Compass },
  { type: 'radar', labelKey: 'preview.kanban_chart_radar', icon: Layers },
]

function ChartToolbar({
  currentType,
  currentGroupBy,
  columns,
  onChangeType,
  onChangeGroupBy,
}: {
  currentType: KanbanChartType
  currentGroupBy: string
  columns: KanbanData['columns']
  onChangeType: (type: KanbanChartType) => void
  onChangeGroupBy: (propId: string) => void
}) {
  const selectableCols = columns.filter((c) => c.type === 'select' || c.type === 'multi-select' || c.id === 'status' || c.id === 'priority')

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3'>
      <div className='flex items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-inset)] p-0.5'>
        {CHART_TYPES.map(({ type, labelKey, icon: IconComponent }) => (
          <button
            key={type}
            type='button'
            onClick={() => onChangeType(type)}
            title={t(labelKey as never)}
            className={`flex items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 py-1 text-[length:var(--text-12)] font-medium transition-colors ${
              currentType === type
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <IconComponent size={14} />
            <span className='hidden sm:inline'>{t(labelKey as never)}</span>
          </button>
        ))}
      </div>

      <div className='flex items-center gap-2 text-[length:var(--text-12)]'>
        <span className='text-[var(--text-tertiary)]'>{t('preview.kanban_chart_group_by')}:</span>
        <select
          value={currentGroupBy}
          onChange={(e) => onChangeGroupBy(e.target.value)}
          className='rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
        >
          {selectableCols.map((c) => (
            <option key={c.id} value={c.id}>
              {formatKanbanPropertyName(c)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function MetricCards({ total, completedCount }: { total: number; completedCount: number }) {
  const rate = total > 0 ? Math.round((completedCount / total) * 100) : 0
  return (
    <div className='grid grid-cols-2 gap-4 p-4 md:grid-cols-4'>
      <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs'>
        <div className='flex items-center justify-between text-[var(--text-tertiary)]'>
          <span className='text-[length:var(--text-11)] font-medium'>{t('preview.kanban_chart_total_items')}</span>
          <TrendingUp size={14} />
        </div>
        <div className='mt-1 text-[length:var(--text-20)] font-bold text-[var(--text-primary)]'>{total}</div>
      </div>

      <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs'>
        <div className='flex items-center justify-between text-[var(--text-tertiary)]'>
          <span className='text-[length:var(--text-11)] font-medium'>{t('preview.kanban_chart_completion_rate')}</span>
          <CheckCircle2 size={14} className='text-[var(--accent)]' />
        </div>
        <div className='mt-1 text-[length:var(--text-20)] font-bold text-[var(--accent)]'>{rate}%</div>
      </div>
    </div>
  )
}

function useChartRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  chartType: KanbanChartType,
  dataset: ReturnType<typeof aggregateKanbanChartData>,
) {
  useEffect(() => {
    let chartInstance: { destroy: () => void } | null = null
    let active = true

    async function init() {
      const { Chart } = await import('chart.js/auto')
      if (!active || !canvasRef.current) return

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      const config = buildChartJsConfig(chartType, dataset, isDark)

      chartInstance = new Chart(canvasRef.current, config as never)
    }

    void init()

    return () => {
      active = false
      if (chartInstance) chartInstance.destroy()
    }
  }, [canvasRef, chartType, dataset])
}

export function KanbanChartView({ data, view, onUpdateView }: KanbanChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [chartType, setChartType] = useState<KanbanChartType>(view.chartType || 'bar')
  const [groupBy, setGroupBy] = useState<string>(view.chartGroupBy || view.groupBy || 'status')

  const groupProp = data.columns.find((c) => c.id === groupBy)
  const dataset = aggregateKanbanChartData(data.items, groupBy, groupProp)

  const completedCount = data.items.filter((it) => {
    const s = String(it.properties.status || '').toLowerCase()
    return s === 'done' || s === 'completed'
  }).length

  useChartRenderer(canvasRef, chartType, dataset)

  const handleTypeChange = (type: KanbanChartType) => {
    setChartType(type)
    onUpdateView?.({ chartType: type })
  }

  const handleGroupByChange = (propId: string) => {
    setGroupBy(propId)
    onUpdateView?.({ chartGroupBy: propId })
  }

  return (
    <div className='flex h-full w-full flex-col overflow-y-auto bg-[var(--bg-inset)]'>
      <ChartToolbar
        currentType={chartType}
        currentGroupBy={groupBy}
        columns={data.columns}
        onChangeType={handleTypeChange}
        onChangeGroupBy={handleGroupByChange}
      />

      <MetricCards total={dataset.total} completedCount={completedCount} />

      <div className='mx-4 mb-6 flex-1 min-h-96 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-sm'>
        <div className='relative h-full w-full'>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}
