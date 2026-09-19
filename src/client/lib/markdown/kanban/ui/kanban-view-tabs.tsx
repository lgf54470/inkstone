import { useRef, type KeyboardEvent } from 'react'
import {
  BarChart2,
  Calendar,
  ChartGantt,
  Kanban,
  LayoutGrid,
  List,
  Table,
  Timeline,
} from 'lucide-react'
import { formatKanbanViewName } from '../i18n-helpers'
import type { KanbanView, KanbanViewType } from '../types'
import { t } from '../../../i18n'

function viewIcon(type: KanbanViewType) {
  switch (type) {
    case 'board':
      return <Kanban size={14} />
    case 'table':
      return <Table size={14} />
    case 'calendar':
      return <Calendar size={14} />
    case 'timeline':
      return <Timeline size={14} />
    case 'gantt':
      return <ChartGantt size={14} />
    case 'list':
      return <List size={14} />
    case 'gallery':
      return <LayoutGrid size={14} />
    case 'chart':
      return <BarChart2 size={14} />
    default:
      return <Kanban size={14} />
  }
}

// The whole list drives one panel, so a tab's own name has to be derivable from that panel's id —
// the panel labels itself back with `aria-labelledby` and cannot know the view id by itself.
export function kanbanViewTabId(panelId: string, viewId: string): string {
  return `${panelId}-tab-${viewId}`
}

// A tablist is one entry point: the arrows carry both focus and selection, wrapping at the ends.
function rovingTabIndex(current: number, key: string, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count
    case 'ArrowLeft':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

export function KanbanViewTabs({
  views,
  activeViewId,
  panelId,
  onSelectView,
}: {
  views: KanbanView[]
  activeViewId: string
  panelId: string
  onSelectView: (viewId: string) => void
}) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingTabIndex(index, event.key, views.length)
    if (next === null) return
    event.preventDefault()
    onSelectView(views[next]!.id)
    tabsRef.current[next]?.focus()
  }

  return (
    <div className='flex flex-wrap items-center gap-1' role='tablist' aria-label={t('preview.kanban_views')}>
      {views.map((v, index) => {
        const isActive = v.id === activeViewId
        return (
          <button
            key={v.id}
            ref={(node) => {
              tabsRef.current[index] = node
            }}
            id={kanbanViewTabId(panelId, v.id)}
            role='tab'
            aria-selected={isActive}
            aria-controls={panelId}
            data-view-type={v.type}
            type='button'
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectView(v.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1 text-[length:var(--text-12)] font-medium transition-colors ${
              isActive
                ? 'bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {viewIcon(v.type)}
            <span>{formatKanbanViewName(v)}</span>
          </button>
        )
      })}
    </div>
  )
}
