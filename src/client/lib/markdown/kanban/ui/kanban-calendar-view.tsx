import { memo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import type { KanbanData, KanbanItem } from '../types'

interface KanbanCalendarViewProps {
  data: KanbanData
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: (dateStr?: string) => void
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

interface CalendarDayCellProps {
  dateStr: string
  dayNum: number
  items: KanbanItem[]
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: (dateStr: string) => void
}

function CalendarDayCell({ dateStr, dayNum, items, onOpenDetail, onAddItem }: CalendarDayCellProps) {
  const matchedItems = items.filter((item) => {
    const start = String(item.properties.startDate || '')
    return start.startsWith(dateStr)
  })

  return (
    <div
      onClick={() => onAddItem(dateStr)}
      className='group/cell relative flex min-h-20 flex-col gap-1 bg-[var(--bg-surface)] p-1.5 hover:bg-[var(--bg-raised)]'
    >
      <div className='flex items-center justify-between'>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
          {dayNum}
        </span>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onAddItem(dateStr)
          }}
          className='opacity-0 transition-opacity group-hover/cell:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          aria-label={t('preview.kanban_new_item')}
        >
          <Plus size={12} />
        </button>
      </div>

      <div className='flex flex-1 flex-col gap-1 overflow-hidden'>
        {matchedItems.map((item) => (
          <button
            key={item.id}
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail(item)
            }}
            className='w-full truncate rounded-[var(--r-xs)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] px-1.5 py-0.5 text-left text-[length:var(--text-11)] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]'
          >
            {item.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function buildCalendarDays(year: number, month: number) {
  const padZero = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: { dateStr: string; dayNum: number }[] = []
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      dateStr: `${year}-${padZero(month + 1)}-${padZero(i)}`,
      dayNum: i,
    })
  }
  return days
}

export const KanbanCalendarView = memo(function KanbanCalendarView({
  data,
  onOpenDetail,
  onAddItem,
}: KanbanCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const blanks = Array.from({ length: firstDay })
  const days = buildCalendarDays(year, month)

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
      <div className='grid flex-1 grid-cols-7 auto-rows-fr gap-px overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)]'>
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} className='min-h-20 bg-[var(--bg-surface)] p-1.5 opacity-40' />
        ))}
        {days.map(({ dateStr, dayNum }) => (
          <CalendarDayCell
            key={dateStr}
            dateStr={dateStr}
            dayNum={dayNum}
            items={data.items}
            onOpenDetail={onOpenDetail}
            onAddItem={onAddItem}
          />
        ))}
      </div>
    </div>
  )
})
