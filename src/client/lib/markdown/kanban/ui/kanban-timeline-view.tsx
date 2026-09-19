import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import {
  buildTimelineDays,
  calculateTimelineBarGeometry,
  type TimelineDateFields,
  type TimelineDay,
} from '../timeline-helpers'
import type { KanbanData, KanbanItem, KanbanView } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'

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
          <Plus size={13} />
          <span>{t('preview.kanban_new_item')}</span>
        </button>
      </div>
    </div>
  )
}

function TimelineChart({
  items,
  days,
  fields,
  onOpenDetail,
}: {
  items: KanbanItem[]
  days: TimelineDay[]
  fields?: TimelineDateFields
  onOpenDetail: (item: KanbanItem) => void
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
                  ? 'flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] font-bold'
                  : 'text-[var(--text-tertiary)]'
              }
            >
              {day}
            </span>
          </div>
        ))}
      </div>

      <div className='min-w-max divide-y divide-[var(--border-subtle)]'>
        {items.map((item) => {
          const { left, width } = calculateTimelineBarGeometry(item, days, fields)

          return (
            <div key={item.id} className='relative h-10'>
              <div
                data-item-id={item.id}
                onClick={() => onOpenDetail(item)}
                style={{ left: `${left}px`, width: `${width}px` }}
                className='absolute top-2 h-6 cursor-pointer rounded-[var(--r-full)] bg-[var(--accent)] px-2.5 text-[length:var(--text-11)] font-medium text-[var(--accent-contrast)] shadow-[var(--shadow-xs)] hover:opacity-90 flex items-center justify-between'
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
  const days = useMemo(() => buildTimelineDays(), [])

  return (
    <div className='flex h-full w-full flex-col overflow-hidden p-4'>
      <div className='flex flex-1 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <TimelineTaskSidebar items={data.items} onOpenDetail={onOpenDetail} onAddItem={onAddItem} />
        <TimelineChart items={data.items} days={days} fields={{ startField: view?.startField, endField: view?.endField }} onOpenDetail={onOpenDetail} />
      </div>
    </div>
  )
})
