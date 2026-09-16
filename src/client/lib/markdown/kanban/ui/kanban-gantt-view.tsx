import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import type { KanbanData, KanbanItem } from '../types'

interface KanbanGanttViewProps {
  data: KanbanData
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
  onUpdateProgress: (itemId: string, progress: number) => void
}

interface GanttDay {
  day: number
  dateStr: string
  isToday: boolean
}

function buildGanttDays(): GanttDay[] {
  const list: GanttDay[] = []
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  for (let i = -7; i <= 21; i++) {
    const d = new Date()
    d.setDate(now.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    list.push({
      day: d.getDate(),
      dateStr,
      isToday: dateStr === todayStr,
    })
  }
  return list
}

function GanttTaskSidebar({
  items,
  onOpenDetail,
  onAddItem,
}: {
  items: KanbanItem[]
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}) {
  return (
    <div className='w-72 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
      <div className='flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-3 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <span>{t('preview.kanban_task')}</span>
        <span>{t('preview.kanban_progress')}</span>
      </div>
      <div className='divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onOpenDetail(item)}
            className='flex h-10 cursor-pointer items-center justify-between px-3 text-[length:var(--text-13)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          >
            <span className='truncate'>{item.title}</span>
            <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
              {Number(item.properties.progress || 0)}%
            </span>
          </div>
        ))}
      </div>
      <div className='p-2'>
        <button
          type='button'
          onClick={onAddItem}
          className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Plus size={13} />
          <span>{t('preview.kanban_new_task')}</span>
        </button>
      </div>
    </div>
  )
}

function GanttBar({
  item,
  days,
  onOpenDetail,
  onUpdateProgress,
}: {
  item: KanbanItem
  days: GanttDay[]
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProgress: (itemId: string, progress: number) => void
}) {
  const start = String(item.properties.startDate || '')
  const startIndex = days.findIndex((d) => d.dateStr === start)
  const leftPos = startIndex >= 0 ? startIndex * 48 + 4 : 48
  const width = 160
  const progress = Math.min(100, Math.max(0, Number(item.properties.progress || 0)))

  return (
    <div className='relative h-10'>
      <div
        onClick={() => onOpenDetail(item)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onUpdateProgress(item.id, (progress + 25) % 125)
        }}
        style={{ left: `${leftPos}px`, width: `${width}px` }}
        className='group/bar absolute top-2 h-6 cursor-pointer overflow-hidden rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-softer)] shadow-[var(--shadow-xs)]'
      >
        <div style={{ width: `${progress}%` }} className='h-full bg-[var(--accent)] transition-all' />
        <div className='absolute inset-0 flex items-center justify-between px-2 text-[length:var(--text-10)] font-semibold text-[var(--text-primary)]'>
          <span className='truncate'>{item.title}</span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  )
}

function GanttTimelineChart({
  items,
  days,
  onOpenDetail,
  onUpdateProgress,
}: {
  items: KanbanItem[]
  days: GanttDay[]
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProgress: (itemId: string, progress: number) => void
}) {
  return (
    <div className='flex-1 overflow-x-auto'>
      <div className='flex min-w-max border-b border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
        {days.map(({ day, isToday, dateStr }) => (
          <div
            key={dateStr}
            className='flex h-12 w-12 shrink-0 flex-col items-center justify-center border-r border-[var(--border-subtle)] text-[length:var(--text-11)]'
          >
            <span
              className={
                isToday
                  ? 'flex size-5 items-center justify-center rounded-full bg-[var(--danger)] text-white font-bold'
                  : 'text-[var(--text-tertiary)]'
              }
            >
              {day}
            </span>
          </div>
        ))}
      </div>

      <div className='min-w-max divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => (
          <GanttBar
            key={item.id}
            item={item}
            days={days}
            onOpenDetail={onOpenDetail}
            onUpdateProgress={onUpdateProgress}
          />
        ))}
      </div>
    </div>
  )
}

export const KanbanGanttView = memo(function KanbanGanttView({
  data,
  onOpenDetail,
  onAddItem,
  onUpdateProgress,
}: KanbanGanttViewProps) {
  const days = useMemo(() => buildGanttDays(), [])

  return (
    <div className='flex h-full w-full flex-col overflow-hidden p-4' role='region' aria-label={t('preview.kanban_view_gantt')}>
      <div className='flex flex-1 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <GanttTaskSidebar items={data.items} onOpenDetail={onOpenDetail} onAddItem={onAddItem} />
        <GanttTimelineChart
          items={data.items}
          days={days}
          onOpenDetail={onOpenDetail}
          onUpdateProgress={onUpdateProgress}
        />
      </div>
    </div>
  )
})
