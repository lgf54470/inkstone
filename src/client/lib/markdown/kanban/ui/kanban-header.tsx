import { memo, useRef, useState } from 'react'
import {
  BarChart2,
  Calendar,
  Filter,
  Kanban,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  SlidersHorizontal,
  Table,
} from 'lucide-react'
import type { KanbanData, KanbanFilter, KanbanSort, KanbanView, KanbanViewType } from '../types'
import { t } from '../../../i18n'
import { formatKanbanViewName } from '../i18n-helpers'
import { KanbanFilterPopover } from './kanban-filter-popover'
import { KanbanProgressBar } from './kanban-progress-bar'
import { KanbanSortPopover } from './kanban-sort-popover'
import { KanbanViewOptions, type CardSize } from './kanban-view-options'

interface KanbanHeaderProps {
  data: KanbanData
  activeView: KanbanView
  searchQuery: string
  filters: KanbanFilter[]
  sorts: KanbanSort[]
  cardSize?: CardSize
  isFullscreen?: boolean
  onSelectView: (viewId: string) => void
  onSearchChange: (q: string) => void
  onChangeFilters: (filters: KanbanFilter[]) => void
  onChangeSorts: (sorts: KanbanSort[]) => void
  onChangeCardSize?: (size: CardSize) => void
  onChangeGroupBy?: (propId: string) => void
  onAddItem: () => void
  onToggleFullscreen?: () => void
}

function viewIcon(type: KanbanViewType) {
  switch (type) {
    case 'board':
      return <Kanban size={14} />
    case 'table':
      return <Table size={14} />
    case 'calendar':
      return <Calendar size={14} />
    case 'timeline':
    case 'gantt':
      return <SlidersHorizontal size={14} />
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

function KanbanViewTabs({
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

function KanbanSearchBox({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (isOpen) {
    return (
      <div className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2 py-0.5'>
        <Search size={13} className='text-[var(--text-tertiary)]' />
        <input
          type='text'
          autoFocus
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('preview.kanban_search_placeholder')}
          className='w-28 border-0 bg-transparent px-1.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        />
      </div>
    )
  }

  return (
    <button
      type='button'
      onClick={() => setIsOpen(true)}
      className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      aria-label={t('preview.kanban_search')}
    >
      <Search size={14} />
    </button>
  )
}

interface HeaderActionsProps {
  columns: KanbanData['columns']
  items: KanbanData['items']
  filters: KanbanFilter[]
  sorts: KanbanSort[]
  searchQuery: string
  activeView: KanbanView
  cardSize?: CardSize
  isFullscreen?: boolean
  onSearchChange: (q: string) => void
  onChangeFilters: (filters: KanbanFilter[]) => void
  onChangeSorts: (sorts: KanbanSort[]) => void
  onChangeCardSize?: (size: CardSize) => void
  onChangeGroupBy?: (propId: string) => void
  onAddItem: () => void
  onToggleFullscreen?: () => void
}

function KanbanViewOptionsAction({
  columns,
  groupBy,
  cardSize,
  onChangeGroupBy,
  onChangeCardSize,
}: {
  columns: KanbanData['columns']
  groupBy: string
  cardSize?: CardSize
  onChangeGroupBy?: (propId: string) => void
  onChangeCardSize?: (size: CardSize) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  if (!onChangeGroupBy || !onChangeCardSize || !cardSize) return null

  return (
    <>
      <button
        ref={btnRef}
        type='button'
        onClick={() => setIsOpen((o) => !o)}
        className='inline-flex items-center gap-1 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        aria-label={t('preview.kanban_group_by')}
      >
        <SlidersHorizontal size={13} />
        <span>{t('preview.kanban_group_by')}</span>
      </button>
      <KanbanViewOptions
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={btnRef}
        columns={columns}
        groupBy={groupBy}
        cardSize={cardSize}
        onChangeGroupBy={onChangeGroupBy}
        onChangeCardSize={onChangeCardSize}
      />
    </>
  )
}

function KanbanFilterAction({
  columns,
  filters,
  onChangeFilters,
}: {
  columns: KanbanData['columns']
  filters: KanbanFilter[]
  onChangeFilters: (filters: KanbanFilter[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={btnRef}
        type='button'
        onClick={() => setIsOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${
          filters.length > 0 ? 'text-[var(--accent)] font-semibold' : ''
        }`}
      >
        <Filter size={13} />
        <span>{t('preview.kanban_filter')}</span>
        {filters.length > 0 && <span className='size-1.5 rounded-full bg-[var(--accent)]' />}
      </button>
      <KanbanFilterPopover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={btnRef}
        columns={columns}
        filters={filters}
        onChangeFilters={onChangeFilters}
      />
    </>
  )
}

function KanbanSortAction({
  columns,
  sorts,
  onChangeSorts,
}: {
  columns: KanbanData['columns']
  sorts: KanbanSort[]
  onChangeSorts: (sorts: KanbanSort[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={btnRef}
        type='button'
        onClick={() => setIsOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${
          sorts.length > 0 ? 'text-[var(--accent)] font-semibold' : ''
        }`}
      >
        <SlidersHorizontal size={13} />
        <span>{t('preview.kanban_sort')}</span>
        {sorts.length > 0 && <span className='size-1.5 rounded-full bg-[var(--accent)]' />}
      </button>
      <KanbanSortPopover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={btnRef}
        columns={columns}
        sorts={sorts}
        onChangeSorts={onChangeSorts}
      />
    </>
  )
}

const STATUS_PROGRESS_BAR_HEIGHT = 6

function KanbanHeaderActions({
  columns,
  items,
  filters,
  sorts,
  searchQuery,
  activeView,
  cardSize,
  isFullscreen,
  onSearchChange,
  onChangeFilters,
  onChangeSorts,
  onChangeCardSize,
  onChangeGroupBy,
  onAddItem,
  onToggleFullscreen,
}: HeaderActionsProps) {
  const statusCol = columns.find((c) => c.id === 'status')

  return (
    <div className='relative flex items-center gap-1.5'>
      <div className='hidden md:flex items-center mr-1 w-28'>
        <KanbanProgressBar items={items} statusColumn={statusCol} height={STATUS_PROGRESS_BAR_HEIGHT} />
      </div>
      <KanbanSearchBox searchQuery={searchQuery} onSearchChange={onSearchChange} />
      <KanbanFilterAction columns={columns} filters={filters} onChangeFilters={onChangeFilters} />
      <KanbanSortAction columns={columns} sorts={sorts} onChangeSorts={onChangeSorts} />
      {activeView.type === 'board' && (
        <KanbanViewOptionsAction
          columns={columns}
          groupBy={activeView.groupBy || 'status'}
          cardSize={cardSize}
          onChangeGroupBy={onChangeGroupBy}
          onChangeCardSize={onChangeCardSize}
        />
      )}

      <button
        type='button'
        onClick={onAddItem}
        className='inline-flex items-center gap-1 rounded-[var(--r-md)] bg-[var(--accent)] px-2.5 py-1 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] shadow-[var(--shadow-btn)] hover:bg-[var(--accent-hover)]'
      >
        <Plus size={14} />
        <span>{t('preview.kanban_new_item')}</span>
      </button>

      {onToggleFullscreen && (
        <button
          type='button'
          onClick={onToggleFullscreen}
          className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          aria-label={isFullscreen ? t('preview.kanban_exit_fullscreen') : t('preview.kanban_fullscreen')}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
    </div>
  )
}

export const KanbanHeader = memo(function KanbanHeader({
  data,
  activeView,
  searchQuery,
  filters,
  sorts,
  cardSize,
  isFullscreen,
  onSelectView,
  onSearchChange,
  onChangeFilters,
  onChangeSorts,
  onChangeCardSize,
  onChangeGroupBy,
  onAddItem,
  onToggleFullscreen,
}: KanbanHeaderProps) {
  return (
    <header className='flex flex-col gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3'>
      {isFullscreen && data.title && (
        <div className='flex items-center justify-between'>
          <h2 className='text-[length:var(--text-18)] font-bold tracking-[var(--tracking-title)] text-[var(--text-primary)]'>
            {data.title}
          </h2>
        </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <KanbanViewTabs
          views={data.views}
          activeViewId={activeView.id}
          onSelectView={onSelectView}
        />
        <KanbanHeaderActions
          columns={data.columns}
          items={data.items}
          filters={filters}
          sorts={sorts}
          searchQuery={searchQuery}
          activeView={activeView}
          cardSize={cardSize}
          isFullscreen={isFullscreen}
          onSearchChange={onSearchChange}
          onChangeFilters={onChangeFilters}
          onChangeSorts={onChangeSorts}
          onChangeCardSize={onChangeCardSize}
          onChangeGroupBy={onChangeGroupBy}
          onAddItem={onAddItem}
          onToggleFullscreen={onToggleFullscreen}
        />
      </div>
    </header>
  )
})
