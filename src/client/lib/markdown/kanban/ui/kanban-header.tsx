import { memo, useRef, useState } from 'react'
import {
  Filter,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  Search,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react'
import type {
  KanbanData,
  KanbanFilter,
  KanbanSort,
  KanbanView,
} from '../types'
import { t } from '../../../i18n'
import { KanbanFilterPopover } from './kanban-filter-popover'
import { KanbanProgressBar } from './kanban-progress-bar'
import { KanbanSortPopover } from './kanban-sort-popover'
import { KanbanTagFilterBar } from './kanban-tag-filter-bar'
import { KanbanViewOptions, type CardSize } from './kanban-view-options'
import { KanbanViewTabs } from './kanban-view-tabs'

interface KanbanHeaderProps {
  data: KanbanData
  activeView: KanbanView
  searchQuery: string
  filters: KanbanFilter[]
  sorts: KanbanSort[]
  selectedTags?: string[]
  cardSize?: CardSize
  isFullscreen?: boolean
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onUpdateBoardTitle?: (title: string) => void
  onSelectView: (viewId: string) => void
  onSearchChange: (q: string) => void
  onChangeFilters: (filters: KanbanFilter[]) => void
  onChangeSorts: (sorts: KanbanSort[]) => void
  onToggleTag?: (tag: string) => void
  onClearTags?: () => void
  onChangeCardSize?: (size: CardSize) => void
  onChangeGroupBy?: (propId: string) => void
  onAddItem: () => void
  onToggleFullscreen?: () => void
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
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
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

function KanbanHeaderToolbar({
  onAddItem,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isFullscreen,
  onToggleFullscreen,
}: {
  onAddItem: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  return (
    <div className='flex items-center gap-1'>
      {onUndo && (
        <button
          type='button'
          disabled={!canUndo}
          onClick={onUndo}
          className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:pointer-events-none'
          title={`${t('common.undo')} (Ctrl+Z)`}
          aria-label={t('common.undo')}
        >
          <Undo2 size={14} />
        </button>
      )}
      {onRedo && (
        <button
          type='button'
          disabled={!canRedo}
          onClick={onRedo}
          className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:pointer-events-none'
          title={`${t('command.redo')} (Ctrl+Y)`}
          aria-label={t('command.redo')}
        >
          <Redo2 size={14} />
        </button>
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

function KanbanFullscreenTitle({
  title,
  onUpdateTitle,
}: {
  title?: string
  onUpdateTitle?: (title: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(title || '')

  const handleFinish = () => {
    setIsEditing(false)
    if (val.trim() && val !== title) onUpdateTitle?.(val.trim())
  }

  if (isEditing && onUpdateTitle) {
    return (
      <input
        type='text'
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleFinish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleFinish()
          else if (e.key === 'Escape') {
            setVal(title || '')
            setIsEditing(false)
          }
        }}
        className='rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--bg-inset)] px-2 py-0.5 text-[length:var(--text-18)] font-bold text-[var(--text-primary)] outline-none'
      />
    )
  }

  return (
    <h2
      onClick={() => {
        if (onUpdateTitle) {
          setVal(title || '')
          setIsEditing(true)
        }
      }}
      className={`text-[length:var(--text-18)] font-bold tracking-[var(--tracking-title)] text-[var(--text-primary)] ${
        onUpdateTitle ? 'cursor-pointer hover:opacity-80' : ''
      }`}
    >
      {title || t('preview.kanban_untitled')}
    </h2>
  )
}

function KanbanHeaderActions(props: HeaderActionsProps) {
  const { columns, items, filters, sorts, searchQuery, activeView, cardSize } = props
  const statusCol = columns.find((c) => c.id === 'status')

  return (
    <div className='relative flex items-center gap-1.5'>
      <div className='hidden md:flex items-center mr-1 w-28'>
        <KanbanProgressBar items={items} statusColumn={statusCol} height={STATUS_PROGRESS_BAR_HEIGHT} />
      </div>
      <KanbanSearchBox searchQuery={searchQuery} onSearchChange={props.onSearchChange} />
      <KanbanFilterAction columns={columns} filters={filters} onChangeFilters={props.onChangeFilters} />
      <KanbanSortAction columns={columns} sorts={sorts} onChangeSorts={props.onChangeSorts} />
      {activeView.type === 'board' && (
        <KanbanViewOptionsAction
          columns={columns}
          groupBy={activeView.groupBy || 'status'}
          cardSize={cardSize}
          onChangeGroupBy={props.onChangeGroupBy}
          onChangeCardSize={props.onChangeCardSize}
        />
      )}
      <KanbanHeaderToolbar
        onAddItem={props.onAddItem}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        isFullscreen={props.isFullscreen}
        onToggleFullscreen={props.onToggleFullscreen}
      />
    </div>
  )
}

export const KanbanHeader = memo(function KanbanHeader(props: KanbanHeaderProps) {
  const { data, activeView, isFullscreen, onUpdateBoardTitle } = props
  const tagsCol = data.columns.find((c) => c.id === 'tags')

  return (
    <header className='flex flex-col gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3'>
      {isFullscreen && (
        <div className='flex items-center justify-between'>
          <KanbanFullscreenTitle
            title={data.title}
            onUpdateTitle={onUpdateBoardTitle}
          />
        </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <KanbanViewTabs
          views={data.views}
          activeViewId={activeView.id}
          onSelectView={props.onSelectView}
        />
        <KanbanHeaderActions
          {...props}
          columns={data.columns}
          items={data.items}
          activeView={activeView}
        />
      </div>

      <KanbanTagFilterBar
        tagsColumn={tagsCol}
        items={data.items}
        selectedTags={props.selectedTags}
        onToggleTag={props.onToggleTag}
        onClearTags={props.onClearTags}
      />
    </header>
  )
})
