import { useState } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { createKanbanId } from '../id'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanItem, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanFilesCell } from './kanban-files-cell'
import { KanbanIconBadge } from './kanban-icon-badge'

interface KanbanTableRowProps {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onUpdateProperty?: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateSubtasks?: (itemId: string, subtasks: KanbanSubtask[]) => void
}

function StatusCell({
  item,
  statusCol,
  onUpdateProperty,
}: {
  item: KanbanItem
  statusCol?: KanbanProperty
  onUpdateProperty?: (itemId: string, propertyId: string, value: unknown) => void
}) {
  const currentVal = String(item.properties.status || '')
  const currentOpt = statusCol?.options?.find((o) => o.id === currentVal || o.label === currentVal)

  return (
    <div className='flex items-center justify-center p-1.5'>
      <select
        value={currentOpt?.id || currentVal}
        onChange={(e) => onUpdateProperty?.(item.id, 'status', e.target.value)}
        style={getKanbanTagStyle(currentOpt?.color)}
        className='h-7 w-full cursor-pointer rounded-[var(--r-sm)] border-none px-2 text-center text-[length:var(--text-11)] font-bold outline-none'
      >
        {statusCol?.options?.map((opt) => (
          <option key={opt.id} value={opt.id} className='bg-[var(--bg-surface)] text-[var(--text-primary)]'>
            {formatKanbanOptionLabel(opt, 'status')}
          </option>
        ))}
      </select>
    </div>
  )
}

function OwnerAvatar({ name }: { name?: string }) {
  if (!name) {
    return (
      <div className='flex size-6 items-center justify-center rounded-[var(--r-full)] border border-dashed border-[var(--border-default)] text-[var(--text-quaternary)]'>
        <UserIcon size={12} />
      </div>
    )
  }
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div className='flex size-6 items-center justify-center rounded-[var(--r-full)] bg-[var(--accent)] text-[length:var(--text-10)] font-bold text-white shadow-xs'>
      {initials}
    </div>
  )
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
  subtasksCount,
  expanded,
  tagsCol,
  tagVals,
  onToggleExpand,
  onOpenDetail,
}: {
  item: KanbanItem
  subtasksCount: number
  expanded: boolean
  tagsCol?: KanbanProperty
  tagVals: string[]
  onToggleExpand: () => void
  onOpenDetail: () => void
}) {
  return (
    <div className='flex flex-1 min-w-48 items-center gap-2 border-l border-[var(--border-subtle)] px-3 py-2'>
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
      {tagVals.slice(0, 2).map((tag) => {
        const opt = tagsCol?.options?.find((o) => o.id === tag || o.label === tag)
        const color = resolveKanbanTagColor(tag, tagsCol?.options)
        const label = opt?.label ?? tag
        return (
          <span
            key={tag}
            style={getKanbanTagStyle(color)}
            className='hidden sm:inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold'
          >
            {formatKanbanOptionLabel(label, 'tags')}
          </span>
        )
      })}
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

function ItemMetaCells({
  item,
  statusCol,
  onUpdateProperty,
}: {
  item: KanbanItem
  statusCol?: KanbanProperty
  onUpdateProperty?: (itemId: string, propertyId: string, value: unknown) => void
}) {
  const ownerName = String(item.properties.assignee || item.properties.owner || '')
  const dueDate = String(item.properties.dueDate || item.properties.date || '')
  const timeline = String(item.properties.timeline || '')

  return (
    <>
      <div className='w-20 shrink-0 border-l border-[var(--border-subtle)] px-2 py-2 text-center'>
        <OwnerAvatar name={ownerName} />
      </div>

      <div className='w-36 shrink-0 border-l border-[var(--border-subtle)]'>
        <StatusCell item={item} statusCol={statusCol} onUpdateProperty={onUpdateProperty} />
      </div>

      <div className='w-32 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2 text-[var(--text-secondary)]'>
        {dueDate ? (
          <div className='flex items-center gap-1.5'>
            <CalendarIcon size={12} className='text-[var(--text-tertiary)]' />
            <span>{dueDate}</span>
          </div>
        ) : (
          <span className='text-[var(--text-quaternary)]'>-</span>
        )}
      </div>

      <div className='w-32 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2'>
        {timeline ? (
          <span className='rounded-[var(--r-full)] bg-[var(--bg-hover)] px-2 py-0.5 text-[length:var(--text-10)] font-medium text-[var(--text-secondary)]'>
            {timeline}
          </span>
        ) : (
          <span className='text-[var(--text-quaternary)]'>-</span>
        )}
      </div>

      <div className='w-40 shrink-0 border-l border-[var(--border-subtle)] px-2 py-1'>
        <KanbanFilesCell
          files={item.files}
          onChangeFiles={(files) => onUpdateProperty?.(item.id, 'files', files)}
        />
      </div>
    </>
  )
}

export function KanbanTableRow({
  item,
  columns,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onUpdateProperty,
  onUpdateSubtasks,
}: KanbanTableRowProps) {
  const [expanded, setExpanded] = useState(false)
  const statusCol = columns.find((c) => c.id === 'status')
  const tagsCol = columns.find((c) => c.id === 'tags')
  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
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
          subtasksCount={subtasks.length}
          expanded={expanded}
          tagsCol={tagsCol}
          tagVals={tagVals}
          onToggleExpand={() => setExpanded((e) => !e)}
          onOpenDetail={onOpenDetail}
        />

        <ItemMetaCells item={item} statusCol={statusCol} onUpdateProperty={onUpdateProperty} />
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
