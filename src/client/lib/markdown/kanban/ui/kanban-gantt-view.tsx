import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Slider } from '../../../../components/form'
import { t, useLocaleRepaint } from '../../../i18n'
import {
  calculateTimelineBarGeometry,
  splitTimelineItems,
  TIMELINE_MAX_DAYS,
  type TimelineDayFields,
  type TimelineRange,
} from '../timeline-helpers'
import type { KanbanData, KanbanItem, KanbanView } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'
import {
  TimelineClippedNotice,
  TimelineDayHeader,
  TimelineRangeControls,
  TimelineUndatedList,
  useTimelineViewState,
} from './kanban-timeline-grid'

interface KanbanGanttViewProps {
  data: KanbanData
  view?: KanbanView
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
  onUpdateProgress: (itemId: string, progress: number) => void
}

const ganttProgress = (item: KanbanItem, progressField: string) =>
  Math.min(100, Math.max(0, Number(item.properties[progressField] || 0)))

function GanttTaskSidebar({
  items,
  progressField,
  onOpenDetail,
  onAddItem,
  onUpdateProgress,
}: {
  items: KanbanItem[]
  progressField: string
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
  onUpdateProgress: (itemId: string, progress: number) => void
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
            className='flex h-10 cursor-pointer items-center justify-between gap-2 px-3 text-[length:var(--text-13)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          >
            <div className='flex min-w-0 items-center gap-1.5'>
              <KanbanIconBadge icon={item.icon} size={14} />
              <span className='truncate'>{item.title}</span>
            </div>
            <span className='w-36 shrink-0' onClick={(e) => e.stopPropagation()}>
              <Slider
                label={t('preview.kanban_progress')}
                value={ganttProgress(item, progressField)}
                min={0}
                max={100}
                step={5}
                suffix='%'
                onChange={(progress) => onUpdateProgress(item.id, progress)}
              />
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
  range,
  fields,
  progressField,
  onOpenDetail,
}: {
  item: KanbanItem
  range: TimelineRange
  fields?: TimelineDayFields
  progressField: string
  onOpenDetail: (item: KanbanItem) => void
}) {
  const bar = calculateTimelineBarGeometry(item, range, fields)
  const progress = ganttProgress(item, progressField)
  if (!bar) return null

  return (
    <div className='relative h-10'>
      <div
        data-item-id={item.id}
        onClick={() => onOpenDetail(item)}
        style={{ left: `${bar.left}px`, width: `${bar.width}px` }}
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
  range,
  fields,
  progressField,
  scrollRef,
  onOpenDetail,
}: {
  items: KanbanItem[]
  range: TimelineRange
  fields?: TimelineDayFields
  progressField: string
  scrollRef: React.RefObject<HTMLDivElement | null>
  onOpenDetail: (item: KanbanItem) => void
}) {
  return (
    <div ref={scrollRef} data-kanban-timeline-grid className='flex-1 overflow-x-auto'>
      <TimelineDayHeader days={range.days} dayWidth={range.dayWidth} />

      <div className='w-max divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => (
          <GanttBar
            key={item.id}
            item={item}
            range={range}
            fields={fields}
            progressField={progressField}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

export const KanbanGanttView = memo(function KanbanGanttView({
  data,
  view,
  onOpenDetail,
  onAddItem,
  onUpdateProgress,
}: KanbanGanttViewProps) {
  useLocaleRepaint()
  const startField = view?.startField
  const endField = view?.endField
  const fields: TimelineDayFields = useMemo(() => ({ startField, endField }), [startField, endField])
  const { dated, undated } = useMemo(() => splitTimelineItems(data.items, fields), [data.items, fields])
  const progressField = view?.progressField || 'progress'
  const { range, zoom, scrollRef, onZoomChange, onToday } = useTimelineViewState(dated, fields)

  return (
    <div data-kanban-gantt className='flex h-full w-full flex-col overflow-hidden p-4'>
      {range.clipped && <TimelineClippedNotice days={TIMELINE_MAX_DAYS} />}
      <TimelineRangeControls zoom={zoom} onZoomChange={onZoomChange} onToday={onToday} />
      <div className='flex flex-1 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <GanttTaskSidebar
          items={dated}
          progressField={progressField}
          onOpenDetail={onOpenDetail}
          onAddItem={onAddItem}
          onUpdateProgress={onUpdateProgress}
        />
        <GanttTimelineChart
          items={dated}
          range={range}
          fields={fields}
          progressField={progressField}
          scrollRef={scrollRef}
          onOpenDetail={onOpenDetail}
        />
      </div>
      <TimelineUndatedList items={undated} onOpenDetail={onOpenDetail} />
    </div>
  )
})
