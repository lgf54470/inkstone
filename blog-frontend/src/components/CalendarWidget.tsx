import { useState, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileText } from 'lucide-react'
import { api } from '../lib/api'
import type { CalendarDayPost } from '../lib/types'
import {
  t,
  formatMonthYear,
  DEFAULT_LOCALE,
  isSupportedLocale,
  type BlogLocale,
} from '../lib/i18n'

interface CalendarWidgetProps {
  initialDays?: CalendarDayPost[]
  isFullPage?: boolean
  initialLocale?: BlogLocale
}

const WEEK_HEADERS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEK_HEADERS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function useCurrentLocale(propLocale?: BlogLocale): BlogLocale {
  const [locale, setLocale] = useState<BlogLocale>(() => {
    if (propLocale) return propLocale
    if (typeof document !== 'undefined') {
      const docLang = document.documentElement.getAttribute('lang')
      if (isSupportedLocale(docLang)) return docLang
    }
    return DEFAULT_LOCALE
  })

  useEffect(() => {
    const handleLocaleChange = (e: Event) => {
      const custom = e as CustomEvent<BlogLocale>
      if (isSupportedLocale(custom.detail)) setLocale(custom.detail)
    }
    window.addEventListener('inkstone-locale-change', handleLocaleChange)
    return () => window.removeEventListener('inkstone-locale-change', handleLocaleChange)
  }, [])

  return propLocale || locale
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function isSameDate(today: Date, year: number, month: number, day: number): boolean {
  return today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
}

function useMonthNav() {
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1) // 1-12

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const goToday = () => {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth() + 1)
  }

  return { currentYear, currentMonth, prevMonth, nextMonth, goToday }
}

function useCalendarDays(initialDays: CalendarDayPost[], currentYear: number, currentMonth: number) {
  const [daysData, setDaysData] = useState<CalendarDayPost[]>(initialDays)

  useEffect(() => {
    let ignore = false
    async function loadData() {
      try {
        const data = await api.getCalendar(currentYear, currentMonth)
        if (!ignore) {
          setDaysData(data)
        }
      } catch (err) {
        console.error('Failed to load calendar data:', err)
      }
    }

    loadData()
    return () => {
      ignore = true
    }
  }, [currentYear, currentMonth])

  return daysData
}

export default function CalendarWidget({
  initialDays = [],
  isFullPage = false,
  initialLocale,
}: CalendarWidgetProps) {
  const locale = useCurrentLocale(initialLocale)
  const { currentYear, currentMonth, prevMonth, nextMonth, goToday } = useMonthNav()
  const daysData = useCalendarDays(initialDays, currentYear, currentMonth)
  const [selectedDay, setSelectedDay] = useState<CalendarDayPost | null>(null)

  useEffect(() => {
    setSelectedDay(null)
  }, [currentYear, currentMonth])

  const today = new Date()

  return (
    <CalendarShell isFullPage={isFullPage}>
      <CalendarHeader
        currentYear={currentYear}
        currentMonth={currentMonth}
        isFullPage={isFullPage}
        locale={locale}
        onPrev={prevMonth}
        onNext={nextMonth}
        onToday={goToday}
      />
      <WeekHeaderRow locale={locale} />
      <DayGrid
        daysData={daysData}
        currentYear={currentYear}
        currentMonth={currentMonth}
        today={today}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />
      {selectedDay && (
        <SelectedDayPanel day={selectedDay} locale={locale} onClose={() => setSelectedDay(null)} />
      )}
    </CalendarShell>
  )
}

function CalendarShell({ isFullPage, children }: { isFullPage: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] transition-all ${
        isFullPage ? 'max-w-2xl mx-auto shadow-[var(--shadow-hover)] p-6' : 'shadow-[var(--shadow-xs)]'
      }`}
    >
      {children}
    </div>
  )
}

function CalendarNavButtons({
  locale,
  onPrev,
  onNext,
  onToday,
}: {
  locale: BlogLocale
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        aria-label={t('calendar.prev_month', {}, locale)}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="text-xs px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
      >
        {t('calendar.today', {}, locale)}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        aria-label={t('calendar.next_month', {}, locale)}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function CalendarHeader({
  currentYear,
  currentMonth,
  isFullPage,
  locale,
  onPrev,
  onNext,
  onToday,
}: {
  currentYear: number
  currentMonth: number
  isFullPage: boolean
  locale: BlogLocale
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-[var(--accent)]" />
        <h3 className={`font-semibold ${isFullPage ? 'text-lg' : 'text-sm'}`}>
          {formatMonthYear(currentYear, currentMonth, locale)}
        </h3>
      </div>
      <CalendarNavButtons locale={locale} onPrev={onPrev} onNext={onNext} onToday={onToday} />
    </div>
  )
}

function WeekHeaderRow({ locale }: { locale: BlogLocale }) {
  const headers = locale === 'en-US' ? WEEK_HEADERS_EN : WEEK_HEADERS_ZH
  return (
    <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
      {headers.map((h, i) => (
        <span
          key={h}
          className={`text-[11px] font-medium py-1 ${
            i === 0 || i === 6 ? 'text-[var(--text-quaternary)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {h}
        </span>
      ))}
    </div>
  )
}

function DayGrid({
  daysData,
  currentYear,
  currentMonth,
  today,
  selectedDay,
  onSelectDay,
}: {
  daysData: CalendarDayPost[]
  currentYear: number
  currentMonth: number
  today: Date
  selectedDay: CalendarDayPost | null
  onSelectDay: (day: CalendarDayPost | null) => void
}) {
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay()
  const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate()

  const postsByDate = new Map<string, CalendarDayPost>()
  for (const d of daysData) {
    postsByDate.set(d.date, d)
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
        <div key={`empty-${i}`} className="aspect-square" />
      ))}
      {Array.from({ length: totalDaysInMonth }).map((_, i) =>
        renderDayCell(i + 1, {
          currentYear,
          currentMonth,
          postsByDate,
          today,
          selectedDay,
          onSelectDay,
        })
      )}
    </div>
  )
}

function renderDayCell(
  day: number,
  {
    currentYear,
    currentMonth,
    postsByDate,
    today,
    selectedDay,
    onSelectDay,
  }: {
    currentYear: number
    currentMonth: number
    postsByDate: Map<string, CalendarDayPost>
    today: Date
    selectedDay: CalendarDayPost | null
    onSelectDay: (day: CalendarDayPost | null) => void
  }
) {
  const dateStr = `${currentYear}-${pad2(currentMonth)}-${pad2(day)}`
  const dayData = postsByDate.get(dateStr)
  const hasPosts = Boolean(dayData && dayData.count > 0)
  const isToday = isSameDate(today, currentYear, currentMonth, day)
  const isSelected = selectedDay?.date === dateStr
  return (
    <DayCell
      key={dateStr}
      day={day}
      isToday={isToday}
      hasPosts={hasPosts}
      isSelected={isSelected}
      onSelect={() => {
        if (hasPosts) onSelectDay(dayData || null)
      }}
    />
  )
}

function DayCell({
  day,
  isToday,
  hasPosts,
  isSelected,
  onSelect,
}: {
  day: number
  isToday: boolean
  hasPosts: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!hasPosts}
      className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium transition-all ${
        isSelected
          ? 'bg-[var(--accent)] text-white font-semibold shadow-[var(--shadow-xs)] ring-2 ring-[var(--accent)] ring-offset-1'
          : hasPosts
          ? 'bg-[var(--accent-softer)] text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer font-bold'
          : isToday
          ? 'border border-[var(--border-strong)] text-[var(--text-primary)] font-semibold'
          : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] disabled:opacity-75 disabled:hover:bg-transparent'
      }`}
    >
      <span>{day}</span>
      {hasPosts && !isSelected && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-0.5" />
      )}
    </button>
  )
}

function SelectedDayPanel({
  day,
  locale,
  onClose,
}: {
  day: CalendarDayPost
  locale: BlogLocale
  onClose: () => void
}) {
  return (
    <div className="mt-4 p-3 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] animate-in fade-in slide-in-from-top-1 duration-[var(--dur-fast)]">
      <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] mb-2">
        <span>{t('calendar.posts_count', { date: day.date, count: day.posts.length }, locale)}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          {t('calendar.close', {}, locale)}
        </button>
      </div>
      <div className="space-y-1.5">
        {day.posts.map((post) => (
          <a
            key={post.slug}
            href={`/posts/${post.slug}`}
            className="flex items-center gap-2 p-1.5 rounded text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="truncate">{post.title}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
