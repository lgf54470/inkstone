import { memo, useState, type KeyboardEvent } from 'react'
import { Calendar, CheckSquare, MoreHorizontal, User } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import type { KanbanColorName, KanbanItem, KanbanProperty } from '../types'

interface KanbanCardProps {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onMoveColumn?: (id: string, direction: 'prev' | 'next') => void
}

function CardHeader({
  isSelected,
  icon,
  onToggleSelect,
  onOpenDetail,
}: {
  isSelected: boolean
  icon?: string
  onToggleSelect: () => void
  onOpenDetail: () => void
}) {
  return (
    <div className='flex items-start justify-between gap-1'>
      <div className='flex items-center gap-1.5'>
        <input
          type='checkbox'
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)] opacity-0 transition-opacity group-hover/card:opacity-100 checked:opacity-100'
          aria-label={t('preview.kanban_select_card')}
        />
        {icon && <span className='text-[length:var(--text-14)]'>{icon}</span>}
      </div>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail()
        }}
        className='opacity-0 transition-opacity group-hover/card:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_card_details')}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}

function CardTitle({
  title,
  isEditing,
  titleText,
  onChangeText,
  onStartEditing,
  onBlur,
  onCancel,
}: {
  title: string
  isEditing: boolean
  titleText: string
  onChangeText: (text: string) => void
  onStartEditing: () => void
  onBlur: () => void
  onCancel: () => void
}) {
  if (isEditing) {
    return (
      <input
        type='text'
        value={titleText}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChangeText(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onBlur()
          if (e.key === 'Escape') onCancel()
        }}
        className='w-full rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-inset)] px-1 py-0.5 text-[length:var(--text-13)] font-medium text-[var(--text-primary)] outline-none'
      />
    )
  }

  return (
    <h4
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEditing()
      }}
      className='line-clamp-2 text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'
    >
      {title || 'Untitled'}
    </h4>
  )
}

function CardTags({
  priorityOpt,
  tagVals,
  tagsCol,
}: {
  priorityOpt?: { label: string; color?: KanbanColorName }
  tagVals: string[]
  tagsCol?: KanbanProperty
}) {
  if (!priorityOpt && tagVals.length === 0) return null

  return (
    <div className='flex flex-wrap items-center gap-1'>
      {priorityOpt && (
        <span
          style={getKanbanTagStyle(priorityOpt.color)}
          className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
        >
          {priorityOpt.label}
        </span>
      )}
      {tagVals.map((tag) => {
        const opt = tagsCol?.options?.find((o) => o.id === tag || o.label === tag)
        const color: KanbanColorName = opt?.color ?? 'gray'
        return (
          <span
            key={tag}
            style={getKanbanTagStyle(color)}
            className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            {opt?.label ?? tag}
          </span>
        )
      })}
    </div>
  )
}

function CardMeta({
  assignee,
  startDate,
  completedSubtasks,
  totalSubtasks,
}: {
  assignee?: unknown
  startDate?: unknown
  completedSubtasks: number
  totalSubtasks: number
}) {
  if (!assignee && !startDate && totalSubtasks === 0) return null

  return (
    <div className='flex flex-wrap items-center gap-2 pt-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      {Boolean(assignee) && (
        <span className='inline-flex items-center gap-1'>
          <User size={12} />
          <span>{String(assignee)}</span>
        </span>
      )}
      {Boolean(startDate) && (
        <span className='inline-flex items-center gap-1'>
          <Calendar size={12} />
          <span>{String(startDate)}</span>
        </span>
      )}
      {totalSubtasks > 0 && (
        <span className='inline-flex items-center gap-1'>
          <CheckSquare size={12} />
          <span>{completedSubtasks}/{totalSubtasks}</span>
        </span>
      )}
    </div>
  )
}

function useKanbanCardTitle(initialTitle: string, onUpdate: (title: string) => void) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(initialTitle)

  const handleBlur = () => {
    setIsEditing(false)
    if (text.trim() && text !== initialTitle) {
      onUpdate(text.trim())
    } else {
      setText(initialTitle)
    }
  }

  const handleCancel = () => {
    setText(initialTitle)
    setIsEditing(false)
  }

  return { isEditing, text, setText, startEditing: () => setIsEditing(true), handleBlur, handleCancel }
}

function handleCardKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  isEditing: boolean,
  onOpen: () => void,
  onMove?: (direction: 'prev' | 'next') => void,
) {
  if (e.key === 'Enter' && !isEditing) {
    e.preventDefault()
    onOpen()
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault()
    onMove?.('next')
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    onMove?.('prev')
  }
}

function getCardDisplayProps(item: KanbanItem, columns: KanbanProperty[]) {
  const priorityCol = columns.find((c) => c.id === 'priority')
  const priorityOpt = priorityCol?.options?.find((o) => o.id === item.properties.priority || o.label === item.properties.priority)
  const tagsCol = columns.find((c) => c.id === 'tags')
  const tagVals = Array.isArray(item.properties.tags) ? item.properties.tags : []
  const completedSubtasks = item.subtasks?.filter((s) => s.completed).length ?? 0
  const totalSubtasks = item.subtasks?.length ?? 0
  return { priorityOpt, tagsCol, tagVals, completedSubtasks, totalSubtasks }
}

export const KanbanCard = memo(function KanbanCard({
  item,
  columns,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onDragStart,
  onDragEnd,
  onMoveColumn,
}: KanbanCardProps) {
  const titleState = useKanbanCardTitle(item.title, (t) => onUpdateTitle(item.id, t))
  const display = getCardDisplayProps(item, columns)

  return (
    <div
      role='button'
      tabIndex={0}
      draggable={!titleState.isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => handleCardKeyDown(e, titleState.isEditing, () => onOpenDetail(item), onMoveColumn ? (dir) => onMoveColumn(item.id, dir) : undefined)}
      className={`group/card relative flex flex-col gap-2 rounded-[var(--r-md)] border bg-[var(--bg-surface)] p-3 text-left shadow-[var(--shadow-xs)] transition-[box-shadow,border-color,background-color] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <CardHeader
        isSelected={isSelected}
        icon={item.icon}
        onToggleSelect={() => onToggleSelect(item.id)}
        onOpenDetail={() => onOpenDetail(item)}
      />
      <div className='min-w-0 flex-1'>
        <CardTitle
          title={item.title}
          isEditing={titleState.isEditing}
          titleText={titleState.text}
          onChangeText={titleState.setText}
          onStartEditing={titleState.startEditing}
          onBlur={titleState.handleBlur}
          onCancel={titleState.handleCancel}
        />
      </div>
      <CardTags priorityOpt={display.priorityOpt} tagVals={display.tagVals} tagsCol={display.tagsCol} />
      <CardMeta
        assignee={item.properties.assignee}
        startDate={item.properties.startDate}
        completedSubtasks={display.completedSubtasks}
        totalSubtasks={display.totalSubtasks}
      />
    </div>
  )
})
