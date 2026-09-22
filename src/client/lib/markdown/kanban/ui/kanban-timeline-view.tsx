import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
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

interface KanbanTimelineViewProps {
  data: KanbanData
  view?: KanbanView
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}

function TimelineTaskSidebar({
  items,
  onOpenDetail,
  onAddItem,
}: {
  items: KanbanItem[]
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}) {
  return (
    <div className='w-60 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
      <div className='h-12 border-b border-[var(--border-subtle)] px-3 py-3 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        {t('preview.kanban_task_name')}
      </div>
      <div className='divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onOpenDetail(item)}
            className='flex h-10 cursor-pointer items-center gap-1.5 px-3 text-[length:var(--text-13)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          >
            <KanbanIconBadge icon={item.icon} size={14} />
            <span className='truncate'>{item.title}</span>
          </div>
        ))}
      </div>
      <div className='p-2'>
        <button
          type='button'
          onClick={onAddItem}
          className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Plus size={13} aria-hidden />
          <span>{t('preview.kanban_new_item')}</span>
        </button>
      </div>
    </div>
  )
}

function TimelineChart({
  items,
  range,
  fields,
  scrollRef,
  onOpenDetail,
}: {
  items: KanbanItem[]
  range: TimelineRange
  fields?: TimelineDayFields
  scrollRef: React.RefObject<HTMLDivElement | null>
  onOpenDetail: (item: KanbanItem) => void
}) {
  return (
    <div ref={scrollRef} data-kanban-timeline-grid className='flex-1 overflow-x-auto'>
      <TimelineDayHeader days={range.days} dayWidth={range.dayWidth} />
      <div className='w-max divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => {
          const bar = calculateTimelineBarGeometry(item, range, fields)
          if (!bar) return null
          return (
            <div key={item.id} className='relative h-10'>
              <div
                data-item-id={item.id}
                onClick={() => onOpenDetail(item)}
                style={{ left: `${bar.left}px`, width: `${bar.width}px` }}
                className={`absolute top-2 flex h-6 cursor-pointer items-center justify-between rounded-[var(--r-full)] bg-[var(--accent)] px-2.5 text-[length:var(--text-11)] font-medium text-[var(--accent-contrast)] shadow-[var(--shadow-xs)] hover:opacity-90 ${
                  bar.clippedBefore ? 'rounded-l-none' : ''
                } ${bar.clippedAfter ? 'rounded-r-none' : ''}`}
              >
                <span className='truncate'>{item.title}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const KanbanTimelineView = memo(function KanbanTimelineView({
  data,
  view,
  onOpenDetail,
  onAddItem,
}: KanbanTimelineViewProps) {
  useLocaleRepaint()
  const startField = view?.startField
  const endField = view?.endField
  const fields: TimelineDayFields = useMemo(() => ({ startField, endField }), [startField, endField])
  const { dated, undated } = useMemo(() => splitTimelineItems(data.items, fields), [data.items, fields])
  const { range, zoom, scrollRef, onZoomChange, onToday } = useTimelineViewState(dated, fields)

  return (
    <div data-kanban-timeline className='flex h-full w-full flex-col overflow-hidden p-4'>
      {range.clipped && <TimelineClippedNotice days={TIMELINE_MAX_DAYS} />}
      <TimelineRangeControls zoom={zoom} onZoomChange={onZoomChange} onToday={onToday} />
      <div className='flex flex-1 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <TimelineTaskSidebar items={dated} onOpenDetail={onOpenDetail} onAddItem={onAddItem} />
        <TimelineChart
          items={dated}
          range={range}
          fields={fields}
          scrollRef={scrollRef}
          onOpenDetail={onOpenDetail}
        />
      </div>
      <TimelineUndatedList items={undated} onOpenDetail={onOpenDetail} />
    </div>
  )
})
