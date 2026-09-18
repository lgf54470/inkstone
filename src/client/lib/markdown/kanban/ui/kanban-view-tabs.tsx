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

export function KanbanViewTabs({
  views,
  activeViewId,
  onSelectView,
}: {
  views: KanbanView[]
  activeViewId: string
  onSelectView: (viewId: string) => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-1' role='tablist' aria-label={t('preview.kanban_views')}>
      {views.map((v) => {
        const isActive = v.id === activeViewId
        return (
          <button
            key={v.id}
            role='tab'
            aria-selected={isActive}
            data-view-type={v.type}
            type='button'
            onClick={() => onSelectView(v.id)}
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
