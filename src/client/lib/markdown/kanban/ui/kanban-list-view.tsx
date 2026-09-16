import { memo } from 'react'
import { Calendar, CheckSquare, Flag, Paperclip, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'

interface KanbanListViewProps {
  data: KanbanData
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}

interface KanbanListRowProps {
  item: KanbanItem
  statusCol?: KanbanProperty
  priorityCol?: KanbanProperty
  tagsCol?: KanbanProperty
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
}

function ListRowLeading({
  item,
  isSelected,
  tagVals,
  tagsCol,
  desc,
  onToggleSelect,
}: {
  item: KanbanItem
  isSelected: boolean
  tagVals: string[]
  tagsCol?: KanbanProperty
  desc?: string
  onToggleSelect: () => void
}) {
  return (
    <div className='flex min-w-0 flex-1 items-center gap-2.5'>
      <input
        type='checkbox'
        checked={isSelected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSelect}
        className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
        aria-label={t('preview.kanban_select_card')}
      />
      <KanbanIconBadge icon={item.icon || '📝'} size={15} />
      <span className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {item.title || t('preview.kanban_untitled')}
      </span>
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
      {desc && (
        <span className='hidden md:inline truncate max-w-xs text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          — {desc}
        </span>
      )}
    </div>
  )
}

function ListRowSubtasksAndDate({
  subtasks,
  dueDate,
}: {
  subtasks: KanbanSubtask[]
  dueDate?: string
}) {
  const completedCount = subtasks.filter((s) => s.completed).length

  return (
    <>
      {subtasks.length > 0 && (
        <span className='hidden sm:inline-flex items-center gap-1 rounded-[var(--r-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[var(--text-tertiary)]'>
          <CheckSquare size={11} />
          <span>{completedCount}/{subtasks.length}</span>
        </span>
      )}
      {dueDate && (
        <span className='hidden sm:inline-flex items-center gap-1 text-[var(--text-secondary)]'>
          <Calendar size={11} className='text-[var(--text-tertiary)]' />
          <span>{dueDate}</span>
        </span>
      )}
    </>
  )
}

function ListRowTrailing({
  item,
  statusOpt,
  priorityOpt,
  dueDate,
}: {
  item: KanbanItem
  statusOpt?: KanbanOption
  priorityOpt?: KanbanOption
  dueDate?: string
}) {
  const subtasks = item.subtasks ?? []
  const filesCount = item.files?.length ?? 0
  const assignee = String(item.properties.assignee || '')

  return (
    <div className='flex shrink-0 items-center gap-2 text-[length:var(--text-11)]'>
      <ListRowSubtasksAndDate subtasks={subtasks} dueDate={dueDate} />
      {statusOpt && (
        <span
          style={getKanbanTagStyle(statusOpt.color)}
          className='inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5 font-medium'
        >
          {formatKanbanOptionLabel(statusOpt, 'status')}
        </span>
      )}
      {priorityOpt && (
        <span
          style={getKanbanTagStyle(priorityOpt.color)}
          className='hidden sm:inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-0.5 font-medium'
        >
          <Flag size={11} />
          <span>{formatKanbanOptionLabel(priorityOpt, 'priority')}</span>
        </span>
      )}
      {filesCount > 0 && (
        <span className='hidden sm:inline-flex items-center gap-0.5 text-[var(--text-tertiary)]'>
          <Paperclip size={11} />
          <span>{filesCount}</span>
        </span>
      )}
      {assignee && (
        <div
          title={assignee}
          className='flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[length:var(--text-10)] font-bold text-[var(--accent)]'
        >
          {assignee.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}

function KanbanListRow({
  item,
  statusCol,
  priorityCol,
  tagsCol,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: KanbanListRowProps) {
  const statusVal = item.properties.status
  const statusOpt = statusCol?.options?.find((o: KanbanOption) => o.id === statusVal || o.label === statusVal)
  const priorityVal = item.properties.priority
  const priorityOpt = priorityCol?.options?.find((o: KanbanOption) => o.id === priorityVal || o.label === priorityVal)
  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const desc = item.content || item.description || (typeof item.properties.description === 'string' ? item.properties.description : undefined)
  const dueDate = String(item.properties.dueDate || item.properties.startDate || '')

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenDetail(item)
      }}
      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)] ${
        isSelected ? 'bg-[var(--accent-softer)]' : ''
      }`}
    >
      <ListRowLeading
        item={item}
        isSelected={isSelected}
        tagVals={tagVals}
        tagsCol={tagsCol}
        desc={desc}
        onToggleSelect={() => onToggleSelect(item.id)}
      />
      <ListRowTrailing
        item={item}
        statusOpt={statusOpt}
        priorityOpt={priorityOpt}
        dueDate={dueDate || undefined}
      />
    </div>
  )
}

export const KanbanListView = memo(function KanbanListView({
  data,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onAddItem,
}: KanbanListViewProps) {
  const statusCol = data.columns.find((c) => c.id === 'status')
  const priorityCol = data.columns.find((c) => c.id === 'priority')
  const tagsCol = data.columns.find((c) => c.id === 'tags')

  return (
    <div className='flex h-full w-full flex-col overflow-y-auto p-4' role='region' aria-label={t('preview.kanban_view_list')}>
      <div className='divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        {data.items.map((item) => (
          <KanbanListRow
            key={item.id}
            item={item}
            statusCol={statusCol}
            priorityCol={priorityCol}
            tagsCol={tagsCol}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
          />
        ))}

        <div className='p-2'>
          <button
            type='button'
            onClick={onAddItem}
            className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          >
            <Plus size={13} />
            <span>{t('preview.kanban_new_item')}</span>
          </button>
        </div>
      </div>
    </div>
  )
})
