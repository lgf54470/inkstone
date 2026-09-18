import { useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { t } from '../../../i18n'
import { createKanbanId } from '../id'
import type { KanbanFile, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'
import {
  KanbanPropertyCell,
  kanbanColumnWidth,
  kanbanPropertyColumns,
  kanbanTitleColumn,
} from './kanban-property-cell'

interface KanbanTableRowProps {
  item: KanbanItem
  columns: KanbanProperty[]
  hiddenColumns?: string[]
  isSelected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onUpdateProperty: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateMultiSelect: (itemId: string, columnId: string, values: string[], newOption?: KanbanOption) => void
  onUpdateSubtasks?: (itemId: string, subtasks: KanbanSubtask[]) => void
  onUpdateFiles: (itemId: string, files: KanbanFile[]) => void
}

function SubitemItemRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: KanbanSubtask
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className='flex flex-col gap-0.5 rounded-[var(--r-xs)] bg-[var(--bg-surface)] px-2 py-1 text-[length:var(--text-12)] shadow-2xs'>
      <div className='flex items-center gap-2'>
        <input
          type='checkbox'
          checked={subtask.completed}
          onChange={onToggle}
          className='size-3 rounded-[var(--r-xs)] accent-[var(--accent)]'
        />
        {subtask.icon && <KanbanIconBadge icon={subtask.icon} size={13} />}
        <span className={`flex-1 ${subtask.completed ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'}`}>
          {subtask.title}
        </span>
        <button
          type='button'
          onClick={onDelete}
          className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
        >
          <Trash2 size={11} />
        </button>
      </div>
      {subtask.description && (
        <p className='pl-5 text-[length:var(--text-11)] text-[var(--text-tertiary)] line-clamp-1'>
          {subtask.description}
        </p>
      )}
    </div>
  )
}

function SubitemsNestedTable({
  subtasks = [],
  onUpdateSubtasks,
}: {
  subtasks: KanbanSubtask[]
  onUpdateSubtasks: (next: KanbanSubtask[]) => void
}) {
  const [newTitle, setNewTitle] = useState('')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    onUpdateSubtasks([
      ...subtasks,
      { id: `sub_${createKanbanId()}`, title: newTitle.trim(), completed: false },
    ])
    setNewTitle('')
  }

  return (
    <div className='border-t border-[var(--border-subtle)] bg-[var(--bg-inset)] py-2 pl-12 pr-4'>
      <div className='mb-1.5 text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
        {t('preview.kanban_subtasks')} ({subtasks.length})
      </div>
      <div className='flex flex-col gap-1'>
        {subtasks.map((st) => (
          <SubitemItemRow
            key={st.id}
            subtask={st}
            onToggle={() =>
              onUpdateSubtasks(
                subtasks.map((s) => (s.id === st.id ? { ...s, completed: !s.completed } : s)),
              )
            }
            onDelete={() => onUpdateSubtasks(subtasks.filter((s) => s.id !== st.id))}
          />
        ))}
        <form onSubmit={handleAdd} className='mt-1 flex items-center gap-1.5'>
          <Plus size={12} className='text-[var(--text-tertiary)]' />
          <input
            type='text'
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('preview.kanban_add_subtask')}
            className='w-full rounded-[var(--r-xs)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[length:var(--text-11)] outline-none focus:border-[var(--accent)]'
          />
        </form>
      </div>
    </div>
  )
}

function ItemTitleCell({
  item,
  column,
  subtasksCount,
  expanded,
  onToggleExpand,
  onOpenDetail,
}: {
  item: KanbanItem
  column: KanbanProperty
  subtasksCount: number
  expanded: boolean
  onToggleExpand: () => void
  onOpenDetail: () => void
}) {
  return (
    <div
      data-kanban-column={column.id}
      className={`flex items-center gap-2 border-l border-[var(--border-subtle)] px-3 py-2 ${kanbanColumnWidth(column)}`}
    >
      {subtasksCount > 0 && (
        <button
          type='button'
          onClick={onToggleExpand}
          className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
      <KanbanIconBadge icon={item.icon} size={15} />
      <button
        type='button'
        onClick={onOpenDetail}
        className='truncate text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]'
      >
        {item.title}
      </button>
      {subtasksCount > 0 && (
        <span className='rounded-[var(--r-full)] bg-[var(--bg-hover)] px-1.5 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {subtasksCount}
        </span>
      )}
      <button
        type='button'
        onClick={onOpenDetail}
        className='ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
      >
        <MessageSquare size={13} />
      </button>
    </div>
  )
}

export function KanbanTableRow({
  item,
  columns,
  hiddenColumns,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onUpdateProperty,
  onUpdateMultiSelect,
  onUpdateSubtasks,
  onUpdateFiles,
}: KanbanTableRowProps) {
  const [expanded, setExpanded] = useState(false)
  const titleColumn = kanbanTitleColumn(columns)
  const propertyColumns = kanbanPropertyColumns(columns, hiddenColumns)
  const subtasks = item.subtasks || []

  return (
    <div data-item-id={item.id} className='flex flex-col border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-hover)]'>
      <div className='flex min-h-10 items-center text-[length:var(--text-12)]'>
        <div className='w-10 shrink-0 p-2.5 text-center'>
          <input
            type='checkbox'
            checked={isSelected}
            onChange={onToggleSelect}
            className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          />
        </div>

        <ItemTitleCell
          item={item}
          column={titleColumn}
          subtasksCount={subtasks.length}
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          onOpenDetail={onOpenDetail}
        />

        {propertyColumns.map((column) => (
          <KanbanPropertyCell
            key={column.id}
            column={column}
            item={item}
            onUpdateProperty={onUpdateProperty}
            onUpdateMultiSelect={onUpdateMultiSelect}
            onUpdateFiles={onUpdateFiles}
          />
        ))}
      </div>

      {expanded && onUpdateSubtasks && (
        <SubitemsNestedTable
          subtasks={subtasks}
          onUpdateSubtasks={(next) => onUpdateSubtasks(item.id, next)}
        />
      )}
    </div>
  )
}
