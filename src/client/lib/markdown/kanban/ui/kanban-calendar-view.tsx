import { memo, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getMonthWeeks, getWeekEventSegments, type CalendarDay, type WeekEventSegment } from '../calendar-helpers'
import { getKanbanTagStyle } from '../colors'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'

interface KanbanCalendarViewProps {
  data: KanbanData
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: (defaults?: Record<string, unknown>) => void
}

interface CalendarHeaderProps {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
}

function CalendarHeader({ year, month, onPrevMonth, onNextMonth, onToday }: CalendarHeaderProps) {
  const padMonth = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`
  return (
    <div className='flex items-center justify-between pb-3'>
      <h3 className='text-[length:var(--text-15)] font-semibold text-[var(--text-primary)]'>
        {year} - {padMonth}
      </h3>
      <div className='flex items-center gap-1.5'>
        <button
          type='button'
          onClick={onToday}
          className='rounded-[var(--r-md)] border border-[var(--border-default)] px-2.5 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        >
          {t('preview.kanban_today')}
        </button>
        <button
          type='button'
          onClick={onPrevMonth}
          className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          aria-label={t('preview.kanban_prev_month')}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type='button'
          onClick={onNextMonth}
          className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          aria-label={t('preview.kanban_next_month')}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function CalendarWeekHeader() {
  return (
    <div className='grid grid-cols-7 border-b border-[var(--border-subtle)] pb-1 text-center text-[length:var(--text-12)] font-medium text-[var(--text-tertiary)]'>
      <span>{t('preview.kanban_sun')}</span>
      <span>{t('preview.kanban_mon')}</span>
      <span>{t('preview.kanban_tue')}</span>
      <span>{t('preview.kanban_wed')}</span>
      <span>{t('preview.kanban_thu')}</span>
      <span>{t('preview.kanban_fri')}</span>
      <span>{t('preview.kanban_sat')}</span>
    </div>
  )
}

function CalendarEventBar({
  segment,
  statusCol,
  onOpenDetail,
}: {
  segment: WeekEventSegment
  statusCol?: KanbanProperty
  onOpenDetail: (item: KanbanItem) => void
}) {
  const { item, startCol, endCol, isSegmentStart, isSegmentEnd, track } = segment
  const statusVal = String(item.properties.status || '')
  const statusOpt = statusCol?.options?.find((o) => o.id === statusVal || o.label === statusVal)
  const tagStyle = getKanbanTagStyle(statusOpt?.color || 'blue')

  const roundedLeft = isSegmentStart ? 'rounded-l-[var(--r-xs)]' : 'rounded-l-none'
  const roundedRight = isSegmentEnd ? 'rounded-r-[var(--r-xs)]' : 'rounded-r-none'

  const colSpan = endCol - startCol + 1

  return (
    <button
      type='button'
      data-item-id={item.id}
      onClick={(e) => {
        e.stopPropagation()
        onOpenDetail(item)
      }}
      style={{
        ...tagStyle,
        gridColumn: `${startCol + 1} / span ${colSpan}`,
        gridRow: track + 1,
      }}
      className={`z-10 flex h-6 items-center gap-1 overflow-hidden px-1.5 text-left text-[length:var(--text-11)] font-medium shadow-2xs transition-opacity hover:opacity-85 ${roundedLeft} ${roundedRight}`}
    >
      <KanbanIconBadge icon={item.icon} size={12} />
      <span className='truncate'>{item.title || t('preview.kanban_untitled')}</span>
    </button>
  )
}

function CalendarDayCellHeader({
  day,
  onAddItem,
}: {
  day: CalendarDay
  onAddItem: (defaults?: Record<string, unknown>) => void
}) {
  const addOnThisDay = () => onAddItem({ startDate: day.dateStr })
  return (
    <div
      onClick={addOnThisDay}
      className='group/day flex cursor-pointer items-center justify-between p-1.5 transition-colors hover:bg-[var(--bg-hover)]/30'
    >
      <span
        className={`text-[length:var(--text-12)] ${
          day.isToday
            ? 'flex size-5 items-center justify-center rounded-full bg-[var(--accent)] font-bold text-white shadow-2xs'
            : day.isCurrentMonth
            ? 'font-medium text-[var(--text-secondary)]'
            : 'text-[var(--text-quaternary)]'
        }`}
      >
        {day.dayNum}
      </span>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          addOnThisDay()
        }}
        className='p-0.5 opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_new_item')}
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

function CalendarWeekRow({
  week,
  items,
  statusCol,
  onOpenDetail,
  onAddItem,
}: {
  week: CalendarDay[]
  items: KanbanItem[]
  statusCol?: KanbanProperty
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: (defaults?: Record<string, unknown>) => void
}) {
  const segments = useMemo(() => getWeekEventSegments(items, week), [items, week])

  return (
    <div className='relative flex min-h-24 flex-1 flex-col border-b border-[var(--border-subtle)] last:border-b-0'>
      <div className='pointer-events-none absolute inset-0 grid grid-cols-7 divide-x divide-[var(--border-subtle)]'>
        {week.map((day) => (
          <div
            key={day.dateStr}
            className={`${day.isCurrentMonth ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-surface)] opacity-40'} ${
              day.isToday ? 'bg-[var(--accent-softer)]/30' : ''
            }`}
          />
        ))}
      </div>

      <div className='relative z-10 grid grid-cols-7'>
        {week.map((day) => (
          <CalendarDayCellHeader
            key={day.dateStr}
            day={day}
            onAddItem={onAddItem}
          />
        ))}
      </div>

      <div className='relative z-10 grid flex-1 grid-cols-7 auto-rows-max gap-y-1 px-1 pb-1'>
        {segments.map((seg) => (
          <CalendarEventBar
            key={`${seg.item.id}-${seg.startCol}`}
            segment={seg}
            statusCol={statusCol}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

export const KanbanCalendarView = memo(function KanbanCalendarView({
  data,
  onOpenDetail,
  onAddItem,
}: KanbanCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const weeks = useMemo(() => getMonthWeeks(year, month), [year, month])
  const statusCol = data.columns.find((c) => c.id === 'status')

  return (
    <div className='flex h-full w-full flex-col overflow-hidden p-4' role='region' aria-label={t('preview.kanban_view_calendar')}>
      <CalendarHeader
        year={year}
        month={month}
        onPrevMonth={() => setCurrentDate(new Date(year, month - 1, 1))}
        onNextMonth={() => setCurrentDate(new Date(year, month + 1, 1))}
        onToday={() => setCurrentDate(new Date())}
      />
      <CalendarWeekHeader />
      <div className='flex flex-1 flex-col overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)]'>
        {weeks.map((week, idx) => (
          <CalendarWeekRow
            key={week[0].dateStr || idx}
            week={week}
            items={data.items}
            statusCol={statusCol}
            onOpenDetail={onOpenDetail}
            onAddItem={onAddItem}
          />
        ))}
      </div>
    </div>
  )
})
