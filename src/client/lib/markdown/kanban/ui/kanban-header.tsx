import { memo, useId, useRef, useState, type ReactNode } from 'react'
import {
  Columns3,
  Filter,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react'
import { Button, IconButton } from '../../../../components/primitives'
import type { KanbanData, KanbanFilter, KanbanSort, KanbanView } from '../types'
import { t, useLocaleRepaint } from '../../../i18n'
import { prettyCombo } from '../../../../lib/hotkeys'
import { kanbanActiveItems } from '../archive'
import { KanbanArchiveAction, type KanbanArchiveEntry } from './kanban-archive'
import { KanbanCsvAction, type KanbanCsvEntry } from './kanban-csv'
import type { KanbanSchemaOperations } from './kanban-column-hooks'
import { KanbanFilterPopover } from './kanban-filter-popover'
import { KanbanFullscreenTitle } from './kanban-fullscreen-title'
import { KanbanProgressBar } from './kanban-progress-bar'
import { KanbanSearchBox } from './kanban-search-box'
import { KanbanSortPopover } from './kanban-sort-popover'
import { KanbanTagFilterBar } from './kanban-tag-filter-bar'
import { KanbanViewOptions, type CardSize } from './kanban-view-options'
import { KanbanViewTabs, type KanbanViewOperations } from './kanban-view-tabs'
import { KanbanWriteStatus } from './kanban-write-status'

interface KanbanHeaderProps {
  data: KanbanData
  visibleItems: KanbanData['items']
  activeView: KanbanView
  searchQuery: string
  filters: KanbanFilter[]
  sorts: KanbanSort[]
  selectedTags?: string[]
  cardSize?: CardSize
  isFullscreen?: boolean
  canUndo?: boolean
  canRedo?: boolean
  unsaved?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onRetryWrite?: () => void
  onDiscardWrite?: () => void
  onUpdateBoardTitle?: (title: string) => void
  onSelectView: (viewId: string) => void
  onSearchChange: (q: string) => void
  onChangeFilters: (filters: KanbanFilter[]) => void
  onChangeSorts: (sorts: KanbanSort[]) => void
  onToggleTag?: (tag: string) => void
  onClearTags?: () => void
  onChangeCardSize?: (size: CardSize) => void
  onChangeGroupBy?: (propId: string) => void
  onChangeSwimlaneBy?: (propId: string | undefined) => void
  onToggleHiddenColumn?: (propertyId: string) => void
  onAddItem: () => void
  onToggleFullscreen?: () => void
  archive?: KanbanArchiveEntry
  csv?: KanbanCsvEntry
  viewOps: KanbanViewOperations
  schemaOps?: KanbanSchemaOperations
  viewPanelId: string
}

// The action cluster is the header minus the view switcher, so it takes the same props; `columns`
// is the one thing it reads that the header spells out as `data`.
type HeaderActionsProps = KanbanHeaderProps & { columns: KanbanData['columns'] }

function KanbanViewOptionsAction({
  columns,
  groupBy,
  swimlaneBy,
  cardSize,
  hiddenColumns,
  onChangeGroupBy,
  onChangeSwimlaneBy,
  onChangeCardSize,
  onToggleHiddenColumn,
  schemaOps,
}: {
  columns: KanbanData['columns']
  groupBy: string
  swimlaneBy?: string
  cardSize?: CardSize
  hiddenColumns?: string[]
  onChangeGroupBy?: (propId: string) => void
  onChangeSwimlaneBy?: (propId: string | undefined) => void
  onChangeCardSize?: (size: CardSize) => void
  onToggleHiddenColumn?: (propertyId: string) => void
  schemaOps?: KanbanSchemaOperations
}) {
  const [isOpen, setIsOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  // The column panel needs nothing but its toggle; the board panel keeps its
  // older rule of showing up only once both of its own writers are wired.
  const isColumnPanel = onToggleHiddenColumn !== undefined
  if (!isColumnPanel && (!onChangeGroupBy || !onChangeCardSize || !cardSize)) return null
  const label = t(isColumnPanel ? 'preview.kanban_columns' : 'preview.kanban_group_by')

  return (
    <>
      <Button
        ref={btnRef}
        size='sm'
        variant='ghost'
        icon={isColumnPanel ? <Columns3 size={13} aria-hidden /> : <SlidersHorizontal size={13} aria-hidden />}
        onClick={() => setIsOpen((o) => !o)}
        aria-label={label}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        {...(isOpen ? { 'aria-controls': panelId } : {})}
      >
        {narrowLabel(label)}
      </Button>
      <KanbanViewOptions
        open={isOpen}
        panelId={panelId}
        onClose={() => setIsOpen(false)}
        anchorRef={btnRef}
        columns={columns}
        groupBy={groupBy}
        swimlaneBy={swimlaneBy}
        cardSize={cardSize}
        hiddenColumns={hiddenColumns}
        onChangeGroupBy={onChangeGroupBy}
        onChangeSwimlaneBy={onChangeSwimlaneBy}
        onChangeCardSize={onChangeCardSize}
        onToggleHiddenColumn={onToggleHiddenColumn}
        schemaOps={schemaOps}
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
  const panelId = useId()
  return (
    <>
      <Button
        ref={btnRef}
        size='sm'
        variant='ghost'
        icon={<Filter size={13} aria-hidden />}
        trailing={filters.length > 0 ? <span className='size-1.5 rounded-full bg-[var(--accent)]' /> : undefined}
        className={filters.length > 0 ? 'text-[var(--accent)] font-semibold' : undefined}
        onClick={() => setIsOpen((o) => !o)}
        aria-label={t('preview.kanban_filter')}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        {...(isOpen ? { 'aria-controls': panelId } : {})}
      >
        {narrowLabel(t('preview.kanban_filter'))}
      </Button>
      <KanbanFilterPopover
        open={isOpen}
        panelId={panelId}
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
  const panelId = useId()
  return (
    <>
      <Button
        ref={btnRef}
        size='sm'
        variant='ghost'
        icon={<SlidersHorizontal size={13} aria-hidden />}
        trailing={sorts.length > 0 ? <span className='size-1.5 rounded-full bg-[var(--accent)]' /> : undefined}
        className={sorts.length > 0 ? 'text-[var(--accent)] font-semibold' : undefined}
        onClick={() => setIsOpen((o) => !o)}
        aria-label={t('preview.kanban_sort')}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        {...(isOpen ? { 'aria-controls': panelId } : {})}
      >
        {narrowLabel(t('preview.kanban_sort'))}
      </Button>
      <KanbanSortPopover
        open={isOpen}
        panelId={panelId}
        onClose={() => setIsOpen(false)}
        anchorRef={btnRef}
        columns={columns}
        sorts={sorts}
        onChangeSorts={onChangeSorts}
      />
    </>
  )
}

/**
 * The written label of a control that is icon-only on a narrow screen, where the words are what pushes
 * the row past the viewport. The label stays in the tree and stays the button's name — hiding it below
 * `md` is a layout change, never a loss of the accessible name the caller spells out next to it.
 */
function narrowLabel(label: string): ReactNode {
  return <span className='hidden md:inline'>{label}</span>
}

const STATUS_PROGRESS_BAR_HEIGHT = 6

/**
 * Undo and redo keep the native hint that names their chord, and `IconButton` refuses a `title` on
 * purpose (a native tooltip is not the project's tooltip). So the two are written out here — at the
 * very size step `IconButton` uses, so a finger gets the same target either way.
 */
const TOOLBAR_ICON_CLASS =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:pointer-events-none disabled:opacity-30 md:size-7'

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
  const undoHint = t('preview.kanban_undo_shortcut', { shortcut: prettyCombo('mod+z').join('+') })
  const redoHint = t('preview.kanban_redo_shortcut', { shortcut: prettyCombo('mod+shift+z').join('+') })
  return (
    <div className='flex items-center gap-1'>
      {onUndo && (
        <button
          type='button'
          disabled={!canUndo}
          onClick={onUndo}
          className={TOOLBAR_ICON_CLASS}
          title={undoHint}
          aria-label={t('common.undo')}
        >
          <Undo2 size={14} aria-hidden />
        </button>
      )}
      {onRedo && (
        <button
          type='button'
          disabled={!canRedo}
          onClick={onRedo}
          className={TOOLBAR_ICON_CLASS}
          title={redoHint}
          aria-label={t('command.redo')}
        >
          <Redo2 size={14} aria-hidden />
        </button>
      )}
      <Button variant='primary' size='sm' icon={<Plus size={14} aria-hidden />} onClick={onAddItem} aria-label={t('preview.kanban_new_item')}>
        {narrowLabel(t('preview.kanban_new_item'))}
      </Button>
      {onToggleFullscreen && (
        <IconButton
          label={isFullscreen ? t('preview.kanban_exit_fullscreen') : t('preview.kanban_fullscreen')}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
        </IconButton>
      )}
    </div>
  )
}

function KanbanHeaderActions(props: HeaderActionsProps) {
  const { columns, visibleItems, filters, sorts, searchQuery, activeView, cardSize } = props
  const statusCol = columns.find((c) => c.id === 'status')

  return (
    // A phone gets a row that wraps instead of a row that runs off the viewport, and never a scroll
    // box: the filter, sort and options panels hang off this element, and an `overflow` here would
    // clip them to the row they are anchored to.
    <div
      data-kanban-actions
      className='relative flex min-w-0 flex-wrap items-center gap-1.5'
    >
      <div className='hidden md:flex items-center mr-1 w-28'>
        <KanbanProgressBar items={visibleItems} statusColumn={statusCol} height={STATUS_PROGRESS_BAR_HEIGHT} />
      </div>
      <KanbanSearchBox searchQuery={searchQuery} onSearchChange={props.onSearchChange} />
      <KanbanFilterAction columns={columns} filters={filters} onChangeFilters={props.onChangeFilters} />
      <KanbanSortAction columns={columns} sorts={sorts} onChangeSorts={props.onChangeSorts} />
      {props.archive && <KanbanArchiveAction {...props.archive} />}
      {props.csv && <KanbanCsvAction {...props.csv} />}
      {(activeView.type === 'board' || activeView.type === 'table') && (
        <KanbanViewOptionsAction
          columns={columns}
          groupBy={activeView.groupBy || 'status'}
          swimlaneBy={activeView.swimlaneBy}
          cardSize={activeView.type === 'board' ? cardSize : undefined}
          hiddenColumns={activeView.hiddenColumns}
          onChangeGroupBy={activeView.type === 'board' ? props.onChangeGroupBy : undefined}
          onChangeSwimlaneBy={activeView.type === 'board' ? props.onChangeSwimlaneBy : undefined}
          onChangeCardSize={activeView.type === 'board' ? props.onChangeCardSize : undefined}
          onToggleHiddenColumn={activeView.type === 'table' ? props.onToggleHiddenColumn : undefined}
          schemaOps={activeView.type === 'table' ? props.schemaOps : undefined}
        />
      )}
      <KanbanWriteStatus unsaved={props.unsaved} onRetry={props.onRetryWrite} onDiscard={props.onDiscardWrite} />
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
  useLocaleRepaint()
  const { data, activeView, isFullscreen, onUpdateBoardTitle } = props
  const tagsCol = data.columns.find((c) => c.id === 'tags')
  // The tag bar offers values a reader could filter the live board down to; a tag that only
  // survives on archived cards would promise an empty result.
  const activeItems = kanbanActiveItems(data.items)

  return (
    <div
      data-kanban-header
      className='flex flex-col gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'
    >
      <div className='flex flex-wrap items-center justify-between gap-2.5'>
        <div className='flex items-center gap-2.5 min-w-0'>
          {isFullscreen && (
            <>
              <KanbanFullscreenTitle
                title={data.title}
                onUpdateTitle={onUpdateBoardTitle}
              />
              <div className='h-4 w-px bg-[var(--border-subtle)] shrink-0' />
            </>
          )}
          <KanbanViewTabs
            views={data.views}
            activeViewId={activeView.id}
            panelId={props.viewPanelId}
            onSelectView={props.onSelectView}
            viewOps={props.viewOps}
          />
        </div>
        <KanbanHeaderActions
          {...props}
          columns={data.columns}
          activeView={activeView}
        />
      </div>

      <KanbanTagFilterBar
        tagsColumn={tagsCol}
        items={activeItems}
        selectedTags={props.selectedTags}
        onToggleTag={props.onToggleTag}
        onClearTags={props.onClearTags}
      />
    </div>
  )
})
