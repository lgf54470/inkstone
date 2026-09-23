import { useMemo } from 'react'
import { t, type MessageKey } from '../../../i18n'
import type { KanbanItem, KanbanProperty } from '../types'

interface KanbanProgressBarProps {
  items: KanbanItem[]
  statusColumn?: KanbanProperty
  height?: number
  className?: string
}

interface Segment {
  /** A real group shows the name the board author gave it; the catch-all bucket shows a translated label. */
  label?: string
  labelKey?: MessageKey
  color: string
  count: number
  percent: number
}

function segmentLabel(seg: Segment): string {
  return seg.labelKey ? t(seg.labelKey) : seg.label ?? ''
}

function resolveSegmentColor(optionColor?: string): string {
  if (!optionColor) return 'var(--text-quaternary)'
  return `var(--kanban-tag-${optionColor}-fg, var(--accent))`
}

function calculateSegments(items: KanbanItem[], statusColumn?: KanbanProperty): Segment[] {
  if (!items.length) return []
  const counts = new Map<string, number>()
  for (const item of items) {
    const val = String(item.properties.status || '__none__')
    counts.set(val, (counts.get(val) || 0) + 1)
  }

  const res: Segment[] = []
  const total = items.length

  if (statusColumn?.options) {
    for (const opt of statusColumn.options) {
      const count = counts.get(opt.id) || counts.get(opt.label) || 0
      if (count > 0) {
        res.push({
          label: opt.label,
          color: resolveSegmentColor(opt.color),
          count,
          percent: (count / total) * 100,
        })
        counts.delete(opt.id)
        counts.delete(opt.label)
      }
    }
  }

  let remaining = 0
  for (const c of counts.values()) remaining += c
  if (remaining > 0) {
    res.push({
      labelKey: 'preview.kanban_status_other',
      color: 'var(--text-quaternary)',
      count: remaining,
      percent: (remaining / total) * 100,
    })
  }

  return res
}

export function KanbanProgressBar({
  items,
  statusColumn,
  height = 8,
  className = '',
}: KanbanProgressBarProps) {
  const segments = useMemo(() => calculateSegments(items, statusColumn), [items, statusColumn])

  if (!segments.length) return null

  return (
    <div
      className={`flex overflow-hidden rounded-[var(--r-full)] bg-[var(--bg-hover)] ${className}`}
      style={{ height }}
    >
      {segments.map((seg, idx) => (
        <div
          key={idx}
          style={{
            width: `${seg.percent}%`,
            backgroundColor: seg.color,
          }}
          title={`${segmentLabel(seg)}: ${seg.count} (${seg.percent.toFixed(0)}%)`}
          className='transition-all duration-300 first:rounded-l-[var(--r-full)] last:rounded-r-[var(--r-full)]'
        />
      ))}
    </div>
  )
}
