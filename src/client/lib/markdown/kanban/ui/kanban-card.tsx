import { memo, useState, type KeyboardEvent } from 'react'
import { Calendar, Flag, MoreHorizontal, Paperclip } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanItem, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanCardSubtasks } from './kanban-card-subtasks'

interface KanbanCardProps {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  cardSize?: 'small' | 'medium' | 'large'
  dropIndicator?: 'top' | 'bottom' | null
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOverCard?: (e: React.DragEvent, id: string) => void
  onDropOnCard?: (e: React.DragEvent, id: string) => void
  onMoveColumn?: (id: string, direction: 'prev' | 'next') => void
}

function CardHeader({
  isSelected,
  tagVals,
  tagsCol,
  onToggleSelect,
  onOpenDetail,
}: {
  isSelected: boolean
  tagVals: string[]
  tagsCol?: KanbanProperty
  onToggleSelect: () => void
  onOpenDetail: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-1.5'>
      <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <input
          type='checkbox'
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)] opacity-0 transition-opacity group-hover/card:opacity-100 checked:opacity-100'
          aria-label={t('preview.kanban_select_card')}
        />
        {tagVals.slice(0, 3).map((tag) => {
          const opt = tagsCol?.options?.find((o) => o.id === tag || o.label === tag)
          const color = opt?.color ?? 'gray'
          const label = opt?.label ?? tag
          return (
            <span
              key={tag}
              style={getKanbanTagStyle(color)}
              className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-semibold'
            >
              {formatKanbanOptionLabel(label, 'tags')}
            </span>
          )
        })}
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
  icon,
  isEditing,
  titleText,
  onChangeText,
  onStartEditing,
  onBlur,
  onCancel,
}: {
  title: string
  icon?: string
  isEditing: boolean
  titleText: string
  onChangeText: (text: string) => void
  onStartEditing: () => void
  onBlur: () => void
  onCancel: () => void
}) {
  if (isEditing) {
    return (
      <div className='flex items-center gap-1.5'>
        {icon && <KanbanIconBadge icon={icon} size={15} />}
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
          className='w-full rounded-[var(--r-xs)] border border-[var(--accent)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[length:var(--text-14)] font-semibold text-[var(--text-primary)] outline-none'
        />
      </div>
    )
  }

  return (
    <h4
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEditing()
      }}
      className='flex items-start gap-1.5 text-[length:var(--text-14)] font-semibold text-[var(--text-primary)] leading-snug'
    >
      {icon && (
        <span className='mt-0.5 shrink-0'>
          <KanbanIconBadge icon={icon} size={15} />
        </span>
      )}
      <span className='line-clamp-2'>{title || t('preview.kanban_untitled')}</span>
    </h4>
  )
}

function CardFooter({
  priorityOpt,
  assignee,
  dueDate,
  filesCount,
}: {
  priorityOpt?: { label: string; color?: KanbanColorName }
  assignee?: unknown
  dueDate?: unknown
  filesCount: number
}) {
  if (!priorityOpt && !assignee && !dueDate && filesCount === 0) return null

  return (
    <div className='flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {priorityOpt && (
          <span
            style={getKanbanTagStyle(priorityOpt.color)}
            className='inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            <Flag size={11} />
            <span>{formatKanbanOptionLabel(priorityOpt.label, 'priority')}</span>
          </span>
        )}
        {Boolean(dueDate) && (
          <span className='inline-flex items-center gap-1 rounded-[var(--r-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
            <Calendar size={11} className='text-[var(--text-tertiary)]' />
            <span>{String(dueDate)}</span>
          </span>
        )}
        {filesCount > 0 && (
          <span className='inline-flex items-center gap-0.5 text-[var(--text-tertiary)]'>
            <Paperclip size={11} />
            <span>{filesCount}</span>
          </span>
        )}
      </div>
      {Boolean(assignee) && (
        <div
          title={String(assignee)}
          className='flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[length:var(--text-10)] font-bold text-[var(--accent)]'
        >
          {String(assignee).slice(0, 2).toUpperCase()}
        </div>
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
  const filesCount = item.files?.length ?? 0
  const dueDate = item.properties.dueDate || item.properties.startDate || item.properties.date
  return { priorityOpt, tagsCol, tagVals, filesCount, dueDate }
}

function CardDropIndicator({ dropIndicator }: { dropIndicator?: 'top' | 'bottom' | null }) {
  if (dropIndicator === 'top') {
    return <div className='pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-[var(--accent)] shadow-[var(--shadow-sm)]' />
  }
  if (dropIndicator === 'bottom') {
    return <div className='pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-[var(--accent)] shadow-[var(--shadow-sm)]' />
  }
  return null
}

function useCardDragHandlers(
  itemId: string,
  onDragOverCard?: (e: React.DragEvent, id: string) => void,
  onDropOnCard?: (e: React.DragEvent, id: string) => void,
) {
  const handleDragOver = (e: React.DragEvent) => {
    if (onDragOverCard) {
      e.preventDefault()
      e.stopPropagation()
      onDragOverCard(e, itemId)
    }
  }
  const handleDrop = (e: React.DragEvent) => {
    if (onDropOnCard) {
      e.preventDefault()
      e.stopPropagation()
      onDropOnCard(e, itemId)
    }
  }
  return { handleDragOver, handleDrop }
}

function CardBody({
  item,
  titleState,
  display,
  onUpdateSubtasks,
}: {
  item: KanbanItem
  titleState: ReturnType<typeof useKanbanCardTitle>
  display: ReturnType<typeof getCardDisplayProps>
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
}) {
  const desc = item.content || item.description || (typeof item.properties.description === 'string' ? item.properties.description : undefined)

  return (
    <>
      <div className='min-w-0 flex-1'>
        <CardTitle
          title={item.title}
          icon={item.icon || '📝'}
          isEditing={titleState.isEditing}
          titleText={titleState.text}
          onChangeText={titleState.setText}
          onStartEditing={titleState.startEditing}
          onBlur={titleState.handleBlur}
          onCancel={titleState.handleCancel}
        />
        {desc && (
          <p className='mt-1 line-clamp-2 text-[length:var(--text-12)] text-[var(--text-tertiary)] leading-normal'>
            {desc}
          </p>
        )}
      </div>
      <KanbanCardSubtasks
        itemId={item.id}
        subtasks={item.subtasks || []}
        onUpdateSubtasks={onUpdateSubtasks}
      />
      <CardFooter
        priorityOpt={display.priorityOpt}
        assignee={item.properties.assignee}
        dueDate={display.dueDate}
        filesCount={display.filesCount}
      />
    </>
  )
}

export const KanbanCard = memo(function KanbanCard({
  item,
  columns,
  isSelected,
  cardSize = 'medium',
  dropIndicator,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onUpdateSubtasks,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
  onMoveColumn,
}: KanbanCardProps) {
  const titleState = useKanbanCardTitle(item.title, (t) => onUpdateTitle(item.id, t))
  const display = getCardDisplayProps(item, columns)
  const dndHandlers = useCardDragHandlers(item.id, onDragOverCard, onDropOnCard)
  const padClass = cardSize === 'small' ? 'p-2.5 gap-1.5' : cardSize === 'large' ? 'p-4 gap-3' : 'p-3 gap-2'

  return (
    <div
      role='button'
      tabIndex={0}
      draggable={!titleState.isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={dndHandlers.handleDragOver}
      onDrop={dndHandlers.handleDrop}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) =>
        handleCardKeyDown(
          e,
          titleState.isEditing,
          () => onOpenDetail(item),
          onMoveColumn ? (dir) => onMoveColumn(item.id, dir) : undefined,
        )
      }
      className={`group/card relative flex flex-col rounded-[var(--r-lg)] border bg-[var(--bg-surface)] text-left shadow-[var(--shadow-xs)] transition-[box-shadow,border-color,background-color] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)] ${padClass} ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <CardDropIndicator dropIndicator={dropIndicator} />
      <CardHeader
        isSelected={isSelected}
        tagVals={display.tagVals}
        tagsCol={display.tagsCol}
        onToggleSelect={() => onToggleSelect(item.id)}
        onOpenDetail={() => onOpenDetail(item)}
      />
      <CardBody
        item={item}
        titleState={titleState}
        display={display}
        onUpdateSubtasks={onUpdateSubtasks}
      />
    </div>
  )
})
