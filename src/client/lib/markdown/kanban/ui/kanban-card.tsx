import { memo, useState, type KeyboardEvent } from 'react'
import { Calendar, Flag, Paperclip } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { CardHeader } from './kanban-card-header'
import { KanbanCardSubtasks } from './kanban-card-subtasks'
import { KanbanIconBadge } from './kanban-icon-badge'

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
  onMoveColumn?: (id: string, direction: 'prev' | 'next') => void
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
  onOpenDetail,
  onBlur,
  onCancel,
}: {
  title: string
  icon?: string
  isEditing: boolean
  titleText: string
  onChangeText: (text: string) => void
  onStartEditing: () => void
  onOpenDetail: () => void
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
    // A card is a third-level heading under the board's own title: the board's `<h2>` (kanban-header)
    // and then the cards, with no level skipped in between. As an `h4` the card jumped a level, which
    // is what a browser reading this surface reports as heading-order.
    // The heading is the card's heading and nothing else: both of the card's title gestures live on
    // the button inside it — a click opens the detail, a double click starts editing — which is what
    // having them on the heading itself cost (an affordance on a non-interactive element, and a
    // keyboard that could reach neither of them).
    <h3 className='flex items-start gap-1.5 text-[length:var(--text-14)] font-semibold text-[var(--text-primary)] leading-snug'>
      {icon && (
        <span className='mt-0.5 shrink-0'>
          <KanbanIconBadge icon={icon} size={15} />
        </span>
      )}
      <button
        type='button'
        onClick={onOpenDetail}
        onDoubleClick={onStartEditing}
        className='line-clamp-2 cursor-pointer text-left hover:text-[var(--accent)]'
      >
        {title || t('preview.kanban_untitled')}
      </button>
    </h3>
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
    if (text.trim() && text !== initialTitle) onUpdate(text.trim())
    else setText(initialTitle)
  }

  const handleCancel = () => {
    setText(initialTitle)
    setIsEditing(false)
  }

  return { isEditing, text, setText, startEditing: () => setIsEditing(true), handleBlur, handleCancel }
}

/**
 * Alt+Arrow still moves the card between columns, and it is read off the card rather than off one of
 * its controls because that is where it was whenever the card itself held focus: a card that is a
 * container of controls, with no control of its own wrapping the rest, receives the event from
 * whichever of them has focus. Opening the detail is no longer one of these — it belongs to the
 * title button, which is a real control and answers Enter on its own.
 */
function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>, onMove?: (direction: 'prev' | 'next') => void) {
  if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault()
    onMove?.(e.key === 'ArrowRight' ? 'next' : 'prev')
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
  onOpenDetail,
  onUpdateSubtasks,
}: {
  item: KanbanItem
  titleState: ReturnType<typeof useKanbanCardTitle>
  display: ReturnType<typeof getCardDisplayProps>
  onOpenDetail: () => void
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
          onOpenDetail={onOpenDetail}
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

/**
 * The board's card is a container of controls, not a control: it carries a selection box, a tag menu,
 * a subtask toggle and a card menu, and the detail it opens belongs to its title button — the same
 * shape the table view's row has. As `role="button"` with a `tabIndex` (SH-107) the card said it was
 * one target while holding four others, which is what a browser reports as `nested-interactive`, and
 * a card-wide click handler is also what a drag has to fight: the pointer that starts a drag is the
 * pointer that would have opened the detail.
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
  const titleState = useKanbanCardTitle(item.title, (t) => onUpdateTitle(item.id, t))
  const display = getCardDisplayProps(item, columns)
  const dndHandlers = useCardDragHandlers(item.id, onDragOverCard, onDropOnCard)
  const padClass = cardSize === 'small' ? 'p-2.5 gap-1.5' : cardSize === 'large' ? 'p-4 gap-3' : 'p-3 gap-2'

  return (
    <div
      data-item-id={item.id}
      draggable={!titleState.isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={dndHandlers.handleDragOver}
      onDrop={dndHandlers.handleDrop}
      onKeyDown={(e) => handleCardKeyDown(e, onMoveColumn ? (d) => onMoveColumn(item.id, d) : undefined)}
      className={`group/card relative flex flex-col rounded-[var(--r-lg)] border bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] transition-[box-shadow,border-color,background-color] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)] ${padClass} ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <CardDropIndicator dropIndicator={dropIndicator} />
      <CardHeader
        isSelected={isSelected}
        itemId={item.id}
        tagVals={display.tagVals}
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
        onOpenDetail={() => onOpenDetail(item)}
        onUpdateSubtasks={onUpdateSubtasks}
      />
    </div>
  )
})
