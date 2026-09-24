import { useMemo } from 'react'
import { kanbanDependencyLinks } from '../dependencies'
import type { TimelineDayFields, TimelineRange } from '../timeline-helpers'
import type { KanbanItem } from '../types'

/**
 * The dependency arrows a time view draws between its bars (KU-23, ADR-0006). One SVG spans the
 * rows area — every row is the same height, so a link's geometry is pure arithmetic over the row
 * index and the bar edges the view itself already computed. The layer is `pointer-events: none`
 * and sits above the rows: it is a reading, not a control, and a click between two bars must land
 * on the bar the reader aimed at, never on the arrow that happens to pass over it. Colours come
 * from tokens (ADR-0002), so the arrows follow the theme the same way the bars' borders do.
 */
export function KanbanDependencyLayer({
  items,
  range,
  fields,
}: {
  items: KanbanItem[]
  range: TimelineRange
  fields?: TimelineDayFields
}) {
  const links = useMemo(() => kanbanDependencyLinks(items, range, fields), [items, range, fields])
  if (links.length === 0) return null
  const width = range.days.length * range.dayWidth
  const height = items.length * 40
  return (
    <svg
      className='pointer-events-none absolute inset-0'
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      focusable='false'
    >
      {links.map((link) => (
        <g key={`${link.fromId}->${link.toId}`}>
          <path
            d={link.path}
            fill='none'
            stroke='var(--border-strong)'
            strokeWidth={1.5}
            strokeLinejoin='round'
          />
          <path d={link.arrow} fill='var(--border-strong)' />
        </g>
      ))}
    </svg>
  )
}
