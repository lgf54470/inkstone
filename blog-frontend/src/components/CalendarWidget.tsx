import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, FileText } from 'lucide-react'
import { api } from '../lib/api'
import type { CalendarDayPost } from '../lib/types'

interface CalendarWidgetProps {
  initialDays?: CalendarDayPost[]
  isFullPage?: boolean
}

export default function CalendarWidget({ initialDays = [], isFullPage = false }: CalendarWidgetProps) {
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1) // 1-12
  const [daysData, setDaysData] = useState<CalendarDayPost[]>(initialDays)
  const [selectedDay, setSelectedDay] = useState<CalendarDayPost | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch when year or month changes
  useEffect(() => {
    let ignore = false
    async function loadData() {
      setLoading(true)
      try {
        const data = await api.getCalendar(currentYear, currentMonth)
        if (!ignore) {
          setDaysData(data)
        }
      } catch (err) {
        console.error('Failed to load calendar data:', err)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadData()
    return () => {
      ignore = true
    }
  }, [currentYear, currentMonth])

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((m) => m - 1)
    }
    setSelectedDay(null)
  }

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
    setSelectedDay(null)
  }

  // Days calculation
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay() // 0 is Sun
  const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate()

  // Map YYYY-MM-DD to CalendarDayPost
  const postsByDate = new Map<string, CalendarDayPost>()
  for (const d of daysData) {
    postsByDate.set(d.date, d)
  }

  const weekHeaders = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div
      className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[var(--text-primary)] transition-all ${
        isFullPage ? 'max-w-2xl mx-auto shadow-md p-6' : 'shadow-xs'
      }`}
    >
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[var(--accent)]" />
          <h3 className={`font-semibold ${isFullPage ? 'text-lg' : 'text-sm'}`}>
            {currentYear}年 {currentMonth}月
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="上个月"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentYear(today.getFullYear())
              setCurrentMonth(today.getMonth() + 1)
            }}
            className="text-xs px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          >
            今
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="下个月"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week Header */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
        {weekHeaders.map((h, i) => (
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

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty slots before day 1 */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Month days */}
        {Array.from({ length: totalDaysInMonth }).map((_, i) => {
          const day = i + 1
          const monthStr = String(currentMonth).padStart(2, '0')
          const dayStr = String(day).padStart(2, '0')
          const dateStr = `${currentYear}-${monthStr}-${dayStr}`
          const isToday =
            today.getFullYear() === currentYear &&
            today.getMonth() + 1 === currentMonth &&
            today.getDate() === day

          const dayData = postsByDate.get(dateStr)
          const hasPosts = Boolean(dayData && dayData.count > 0)
          const isSelected = selectedDay?.date === dateStr

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => {
                if (hasPosts) {
                  setSelectedDay(dayData || null)
                }
              }}
              disabled={!hasPosts}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-[var(--accent)] text-white font-semibold shadow-xs ring-2 ring-[var(--accent)] ring-offset-1'
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
        })}
      </div>

      {/* Selected Day Posts Drawer / Dropdown */}
      {selectedDay && (
        <div className="mt-4 p-3 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-subtle)] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] mb-2">
            <span>{selectedDay.date} 发布文章 ({selectedDay.posts.length} 篇)</span>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              关闭
            </button>
          </div>
          <div className="space-y-1.5">
            {selectedDay.posts.map((post) => (
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
      )}
    </div>
  )
}
