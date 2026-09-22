import { memo, useState, type KeyboardEvent } from 'react'
import { Flag, Paperclip } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { getKanbanCardDate } from '../date-fields'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import { kanbanPersonName } from '../person'
import type { KanbanColorName, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { CardHeader } from './kanban-card-header'
import { KanbanCardSubtasks } from './kanban-card-subtasks'
import { KanbanDateBadge } from './kanban-date-badge'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanPersonAvatar } from './kanban-person-picker'

/** Alt+Arrow walks a card to a neighbour of the cell it sits in: left/right are columns, up/down bands. */
export type CardMoveDirection = 'prev' | 'next' | 'up' | 'down'

interface KanbanCardProps {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  cardSize?: 'small' | 'medium' | 'large'
  dropIndicator?: 'top' | 'bottom' | null
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOverCard?: (e: React.DragEvent, id: string) => void
  onDropOnCard?: (e: React.DragEvent, id: string) => void
  onMoveColumn?: (id: string, direction: CardMoveDirection) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
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
          data-owns-escape='true'
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
    <h3
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
    </h3>
  )
}

function CardFooter({
  item,
  priorityOpt,
  filesCount,
}: {
  item: KanbanItem
  priorityOpt?: { label: string; color?: KanbanColorName }
  filesCount: number
}) {
  const assignee = kanbanPersonName(item.properties.assignee)
  if (!priorityOpt && !assignee && !getKanbanCardDate(item) && filesCount === 0) return null

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
        <KanbanDateBadge item={item} />
        {filesCount > 0 && (
          <span className='inline-flex items-center gap-0.5 text-[var(--text-tertiary)]'>
            <Paperclip size={11} />
            <span>{filesCount}</span>
          </span>
        )}
      </div>
      {assignee && <KanbanPersonAvatar name={assignee} />}
    </div>
  )
}

function useKanbanCardTitle(initialTitle: string, onUpdate: (title: string) => void) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(initialTitle)

  const handleBlur = () => {
    setIsEditing(false)
    if (text.trim() && text !== initialTitle) onUpdate(text.trim())
    else setText(initialTitle)
  }

  const handleCancel = () => {
    setText(initialTitle)
    setIsEditing(false)
  }

  return { isEditing, text, setText, startEditing: () => setIsEditing(true), handleBlur, handleCancel }
}

function handleCardKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  onMove?: (direction: CardMoveDirection) => void,
) {
  if (!e.altKey) return
  const direction: CardMoveDirection | undefined =
    e.key === 'ArrowRight' ? 'next'
      : e.key === 'ArrowLeft' ? 'prev'
        : e.key === 'ArrowDown' ? 'down'
          : e.key === 'ArrowUp' ? 'up'
            : undefined
  if (!direction) return
  e.preventDefault()
  onMove?.(direction)
}

function getCardDisplayProps(item: KanbanItem, columns: KanbanProperty[]) {
  const priorityCol = columns.find((c) => c.id === 'priority')
  const priorityOpt = priorityCol?.options?.find((o) => o.id === item.properties.priority || o.label === item.properties.priority)
  const tagsCol = columns.find((c) => c.id === 'tags')
  const tagVals = Array.isArray(item.properties.tags) ? item.properties.tags : []
  const filesCount = item.files?.length ?? 0
  return { priorityOpt, tagsCol, tagVals, filesCount }
}

function CardDropIndicator({ dropIndicator }: { dropIndicator?: 'top' | 'bottom' | null }) {
  if (!dropIndicator) return null
  const posClass = dropIndicator === 'top' ? '-top-1' : '-bottom-1'
  return <div className={`pointer-events-none absolute ${posClass} left-0 right-0 h-0.5 rounded-full bg-[var(--accent)] shadow-[var(--shadow-sm)]`} />
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
          icon={item.icon}
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
        item={item}
        priorityOpt={display.priorityOpt}
        filesCount={display.filesCount}
      />
    </>
  )
}

function headerOverlayClass(cardSize: 'small' | 'medium' | 'large', tagCount: number): string | undefined {
  if (tagCount > 0) return undefined
  const pad = cardSize === 'small' ? 'inset-x-2.5 top-2.5' : cardSize === 'large' ? 'inset-x-4 top-4' : 'inset-x-3 top-3'
  return `absolute ${pad}`
}

/**
 * A card's container is deliberately not a control: no `role`, no `tabIndex`. It is a pointer hit-area,
 * and the card's keyboard and assistive-technology path is CardHeader's details button — giving this div
 * `role='button'` would add a second, unlabeled control for the same action and a second tab stop that
 * reads as a duplicate. Key events still reach the container's handler, because they bubble from the
 * focused children (the checkbox, the title button, the menus); a card with nothing focused is not
 * expected to answer a key press, and moving a card by keyboard is offered from those menus too. This is
 * the exemption registered under AGENTS.md rule 10 (review K-23), stated rather than left implicit.
 */
export const KanbanCard = memo(function KanbanCard({
  item,
  columns,
  isSelected,
  cardSize = 'medium',
  dropIndicator,
  selectedTags,
  onToggleSelect,
  onOpenDetail,
  onToggleTag,
  onUpdateTitle,
  onUpdateSubtasks,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
  onMoveColumn,
  onUpdateTags,
  onAddColumnOption,
}: KanbanCardProps) {
  useLocaleRepaint()
  const titleState = useKanbanCardTitle(item.title, (t) => onUpdateTitle(item.id, t))
  const display = getCardDisplayProps(item, columns)
  const dndHandlers = useCardDragHandlers(item.id, onDragOverCard, onDropOnCard)
  const padClass = cardSize === 'small' ? 'p-2.5 gap-1.5' : cardSize === 'large' ? 'p-4 gap-3' : 'p-3 gap-2'
  const headerOverlay = headerOverlayClass(cardSize, display.tagVals.length)

  return (
    <div
      data-item-id={item.id}
      draggable={!titleState.isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={dndHandlers.handleDragOver}
      onDrop={dndHandlers.handleDrop}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => handleCardKeyDown(e, onMoveColumn ? (d) => onMoveColumn(item.id, d) : undefined)}
      className={`group/card relative flex flex-col rounded-[var(--r-lg)] border bg-[var(--bg-surface)] text-left shadow-[var(--shadow-xs)] transition-[box-shadow,border-color,background-color] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)] ${padClass} ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <CardDropIndicator dropIndicator={dropIndicator} />
      <CardHeader
        isSelected={isSelected}
        itemId={item.id}
        tagVals={display.tagVals}
        overlayClass={headerOverlay}
        tagsCol={display.tagsCol}
        selectedTags={selectedTags}
        onToggleSelect={() => onToggleSelect(item.id)}
        onOpenDetail={() => onOpenDetail(item)}
        onToggleTag={onToggleTag}
        onUpdateTags={onUpdateTags}
        onAddColumnOption={onAddColumnOption}
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
