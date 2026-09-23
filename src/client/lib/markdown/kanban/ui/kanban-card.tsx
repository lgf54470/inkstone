import { memo, type KeyboardEvent } from 'react'
import { Flag, Paperclip } from 'lucide-react'
import { useLocaleRepaint } from '../../../i18n'
import { isEditableTarget } from '../../../hotkeys'
import { readKanbanCardFields } from '../card-fields'
import { getKanbanTagStyle } from '../colors'
import { getKanbanCardDate } from '../date-fields'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import { kanbanPersonName } from '../person'
import type { KanbanColorName, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { CardHeader } from './kanban-card-header'
import { KanbanCardSubtasks } from './kanban-card-subtasks'
import { CardTitle, useCardTitleGestures, useKanbanCardTitle } from './kanban-card-title'
import { KanbanDateBadge } from './kanban-date-badge'
import { KanbanPersonAvatar } from './kanban-person-picker'

/** Shift+Arrow walks a card to a neighbour of the cell it sits in: left/right are columns, up/down bands. */
export type CardMoveDirection = 'prev' | 'next' | 'up' | 'down'

interface KanbanCardProps {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  cardSize?: 'small' | 'medium' | 'large'
  dropIndicator?: 'top' | 'bottom' | null
  /** Columns the view wants printed under the title, in its order (see `card-fields.ts`). */
  cardFields?: string[]
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


const CARD_MOVE_KEYS: Record<string, CardMoveDirection> = {
  ArrowRight: 'next',
  ArrowLeft: 'prev',
  ArrowDown: 'down',
  ArrowUp: 'up',
}

/**
 * Shift+Arrow walks a card one step of the grid. It used to be Alt+Arrow, which had to go: Alt+Left
 * and Alt+Right are the browser's own Back and Forward on Windows and Linux, so the card gesture
 * shared a chord with leaving the page and only worked for as long as the page won the race for it.
 * Shift is owned by nothing on its own, but it is how text is selected inside a field, so a key press
 * that started in one is left to the field.
 *
 * It is read off the card rather than off one of its controls, because that is where a card that is a
 * container of controls receives it: the event bubbles from whichever of them has focus. Opening the
 * detail is not one of these — that belongs to the title button, which is a real control and answers
 * Enter on its own.
 */
function handleCardKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  onMove?: (direction: CardMoveDirection) => void,
) {
  if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
  const direction = CARD_MOVE_KEYS[e.key]
  if (!direction || isEditableTarget(e.target)) return
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

/**
 * The values the view asked for, under the card's title. They are a description list because that is
 * what they are — a column's name and the value under it — and because a screen reader then reads
 * the pair as one thing rather than as two loose strings. A field with no value prints its name alone,
 * which is how a flag reads, and a field the card has nothing for is left out rather than drawn empty.
 */
function CardFieldValues({ item, fields, columns }: { item: KanbanItem; fields?: string[]; columns: KanbanProperty[] }) {
  if (!fields || fields.length === 0) return null
  const read = readKanbanCardFields(item, fields, columns)
  if (read.length === 0) return null
  return (
    <dl
      data-kanban-card-fields
      className='flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--text-11)] leading-normal'
    >
      {read.map((field) => (
        <div key={field.id} className='flex min-w-0 items-baseline gap-1'>
          <dt className='shrink-0 text-[var(--text-tertiary)]'>{field.label}</dt>
          {field.value !== '' && <dd className='min-w-0 truncate text-[var(--text-secondary)]'>{field.value}</dd>}
        </div>
      ))}
    </dl>
  )
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
  columns,
  cardFields,
  titleState,
  display,
  onOpenDetail,
  onUpdateSubtasks,
}: {
  item: KanbanItem
  columns: KanbanProperty[]
  cardFields?: string[]
  titleState: ReturnType<typeof useKanbanCardTitle>
  display: ReturnType<typeof getCardDisplayProps>
  onOpenDetail: () => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
}) {
  const desc = item.content || item.description || (typeof item.properties.description === 'string' ? item.properties.description : undefined)
  const gestures = useCardTitleGestures(onOpenDetail, titleState.startEditing)

  return (
    <>
      {/*
        * The card's type sits on this wrapper rather than on the heading: prose owns a note's `h3`
        * and is loaded unlayered, so it beats any utility written on the heading itself, while a
        * wrapper is a rule prose has none for (see the hand-back block in `styles/kanban.css`).
        */}
      <div className='flex min-w-0 flex-1 flex-col gap-1 text-[length:var(--text-14)] font-semibold leading-snug'>
        <CardTitle
          title={item.title}
          icon={item.icon}
          isEditing={titleState.isEditing}
          titleText={titleState.text}
          onChangeText={titleState.setText}
          onStartEditing={titleState.startEditing}
          onTitleClick={gestures.handleTitleClick}
          onTitleDoubleClick={gestures.handleTitleDoubleClick}
          onTitleKeyDown={gestures.handleTitleKeyDown}
          onBlur={titleState.handleBlur}
          onCancel={titleState.handleCancel}
        />      {desc && (
        <p className='line-clamp-2 text-[length:var(--text-12)] font-normal text-[var(--text-tertiary)] leading-normal'>
          {desc}
        </p>
      )}
      </div>
      <CardFieldValues item={item} fields={cardFields} columns={columns} />
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

/**
 * The board's card is a container of controls, not a control: it carries a selection box, a tag menu,
 * a subtask toggle and a card menu, and the detail it opens belongs to its title button — the same
 * shape the table view's row has. As `role="button"` with a `tabIndex` (SH-107) the card said it was
 * one target while holding four others, which is what a browser reports as `nested-interactive`, and
 * a card-wide click handler is also what a drag has to fight: the pointer that starts a drag is the
 * pointer that would have opened the detail.
 *
 * The reveal row keeps its place in the card whether or not the card shows tags. Floating it over the
 * card's own top edge when there are none saved a row's height and painted the tag control across the
 * title: outside the note (the board overlay, where no prose margin pushes the title down) the row
 * landed exactly on the first line, and axe could not even tell what the title was written on. A row
 * that is always in flow costs its height and buys back three things — nothing is painted over the
 * title, hovering never moves what is under the pointer, and a card with no tags is as tall as one with.
 */
export const KanbanCard = memo(function KanbanCard({
  item,
  columns,
  isSelected,
  cardSize = 'medium',
  dropIndicator,
  cardFields,
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

  return (
    <div
      data-item-id={item.id}
      draggable={!titleState.isEditing}
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onDragOver={dndHandlers.handleDragOver}
      onDrop={dndHandlers.handleDrop}
      onKeyDown={(e) => handleCardKeyDown(e, onMoveColumn ? (d) => onMoveColumn(item.id, d) : undefined)}
      className={`group/card relative flex flex-col rounded-[var(--r-lg)] border bg-[var(--bg-raised)] text-left shadow-[var(--shadow-xs)] transition-[box-shadow,border-color,background-color] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)] ${padClass} ${
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
        columns={columns}
        cardFields={cardFields}
        titleState={titleState}
        display={display}
        onOpenDetail={() => onOpenDetail(item)}
        onUpdateSubtasks={onUpdateSubtasks}
      />
    </div>
  )
})
