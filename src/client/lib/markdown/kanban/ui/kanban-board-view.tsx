import { memo, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import { groupKanbanItems } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanData, KanbanItem, KanbanView } from '../types'
import { useKanbanBoardDndState, type CardDropTarget } from './kanban-board-dnd'
import { KanbanCard } from './kanban-card'
import { KanbanColumnMenu } from './kanban-column-menu'
import type { CardSize } from './kanban-view-options'

interface KanbanBoardViewProps {
  data: KanbanData
  view: KanbanView
  selectedIds: Set<string>
  cardSize?: CardSize
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void
  onAddItem: (groupKey?: string) => void
  onAddColumn: () => void
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void
  onUpdateColumn?: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  onDeleteColumn?: (groupKey: string) => void
}

function ColumnHeaderTitle({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color?: KanbanColorName
}) {
  const dotColor = getKanbanDotColor(color)
  return (
    <div className='flex min-w-0 items-center gap-2'>
      {dotColor && <span className='size-2.5 shrink-0 rounded-full' style={{ backgroundColor: dotColor }} />}
      <span className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {label}
      </span>
      <span className='shrink-0 rounded-[var(--r-full)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {count}
      </span>
    </div>
  )
}

function KanbanColumnHeader({
  groupKey,
  label,
  count,
  color,
  onDragStart,
  onRename,
  onChangeColor,
  onCollapse,
  onDelete,
}: {
  groupKey: string
  label: string
  count: number
  color?: KanbanColorName
  onDragStart: (e: React.DragEvent) => void
  onRename: (newLabel: string) => void
  onChangeColor: (newColor: KanbanColorName) => void
  onCollapse: () => void
  onDelete?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const localizedLabel = formatKanbanGroupLabel(groupKey, label)

  return (
    <div
      draggable={groupKey !== '__none__'}
      onDragStart={onDragStart}
      className='relative flex cursor-grab items-center justify-between px-2 py-1.5 active:cursor-grabbing'
    >
      <ColumnHeaderTitle label={localizedLabel} count={count} color={color} />
      <button
        ref={menuBtnRef}
        type='button'
        onClick={() => setMenuOpen((o) => !o)}
        className='rounded-[var(--r-xs)] p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        aria-label={localizedLabel}
      >
        <MoreHorizontal size={14} />
      </button>
      <KanbanColumnMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuBtnRef}
        groupKey={groupKey}
        label={label}
        color={color}
        onRename={onRename}
        onChangeColor={onChangeColor}
        onCollapse={onCollapse}
        onDelete={onDelete}
      />
    </div>
  )
}

function CollapsedColumn({
  group,
  onExpand,
  onDrop,
  onDragOver,
  isDragOver,
}: {
  group: ReturnType<typeof groupKanbanItems>[number]
  onExpand: () => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  isDragOver: boolean
}) {
  const dotColor = getKanbanDotColor(group.color)
  const localizedLabel = formatKanbanGroupLabel(group.groupKey, group.label)

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onExpand}
      role='button'
      tabIndex={0}
      aria-label={`${t('preview.kanban_expand_column')}: ${localizedLabel}`}
      className={`flex w-10 shrink-0 cursor-pointer flex-col items-center rounded-[var(--r-lg)] border py-3 transition-colors ${
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <div className='flex flex-col items-center gap-2'>
        {dotColor && <span className='size-2.5 rounded-full' style={{ backgroundColor: dotColor }} />}
        <span className='rounded-[var(--r-full)] bg-[var(--bg-surface)] px-1 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {group.items.length}
        </span>
      </div>
      <div className='mt-4 flex flex-1 items-center justify-center [writing-mode:vertical-rl] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {localizedLabel}
      </div>
    </div>
  )
}

interface ColumnCardsListProps {
  items: KanbanItem[]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  cardSize?: CardSize
  cardDropTarget: CardDropTarget | null
  groupKey: string
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onDragStartCard: (e: React.DragEvent, id: string, sourceGroupKey: string) => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent, id: string) => void
  onDropCard: (e: React.DragEvent, id: string) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: () => void
}

function ColumnCardsList(props: ColumnCardsListProps) {
  return (
    <div className='mt-2 flex flex-1 flex-col gap-2 overflow-y-auto'>
      {props.items.map((item) => (
        <KanbanCard
          key={item.id}
          item={item}
          columns={props.columns}
          isSelected={props.selectedIds.has(item.id)}
          cardSize={props.cardSize}
          dropIndicator={props.cardDropTarget?.cardId === item.id ? props.cardDropTarget.position : null}
          onToggleSelect={props.onToggleSelect}
          onOpenDetail={props.onOpenDetail}
          onUpdateTitle={props.onUpdateTitle}
          onDragStart={(e) => props.onDragStartCard(e, item.id, props.groupKey)}
          onDragEnd={props.onDragEnd}
          onDragOverCard={props.onDragOverCard}
          onDropOnCard={props.onDropCard}
          onMoveColumn={(_id, dir) => props.onMoveColumn(item.id, dir)}
        />
      ))}

      <button
        type='button'
        onClick={props.onAddItem}
        className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <Plus size={13} />
        <span>{t('preview.kanban_new_item')}</span>
      </button>
    </div>
  )
}

interface KanbanBoardColumnProps {
  group: ReturnType<typeof groupKanbanItems>[number]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  cardSize?: CardSize
  cardDropTarget: CardDropTarget | null
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStartCard: (e: React.DragEvent, id: string, sourceGroupKey: string) => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent, id: string) => void
  onDropCard: (e: React.DragEvent, group: ReturnType<typeof groupKanbanItems>[number], id: string) => void
  onDragStartColumn: (e: React.DragEvent) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: () => void
  onRenameColumn: (newLabel: string) => void
  onChangeColumnColor: (newColor: KanbanColorName) => void
  onCollapseColumn: () => void
  onDeleteColumn?: () => void
}

const KanbanBoardColumn = memo(function KanbanBoardColumn({
  group,
  columns,
  selectedIds,
  cardSize,
  cardDropTarget,
  isDragOver,
  onDragOver,
  onDrop,
  onDragStartCard,
  onDragEnd,
  onDragOverCard,
  onDropCard,
  onDragStartColumn,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onMoveColumn,
  onAddItem,
  onRenameColumn,
  onChangeColumnColor,
  onCollapseColumn,
  onDeleteColumn,
}: KanbanBoardColumnProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex w-72 shrink-0 flex-col rounded-[var(--r-lg)] border bg-[var(--bg-raised)] p-2 transition-colors ${
        isDragOver ? 'border-[var(--accent)] bg-[var(--accent-softer)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <KanbanColumnHeader
        groupKey={group.groupKey}
        label={group.label}
        count={group.items.length}
        color={group.color}
        onDragStart={onDragStartColumn}
        onRename={onRenameColumn}
        onChangeColor={onChangeColumnColor}
        onCollapse={onCollapseColumn}
        onDelete={onDeleteColumn}
      />

      <ColumnCardsList
        items={group.items}
        columns={columns}
        selectedIds={selectedIds}
        cardSize={cardSize}
        cardDropTarget={cardDropTarget}
        groupKey={group.groupKey}
        onToggleSelect={onToggleSelect}
        onOpenDetail={onOpenDetail}
        onUpdateTitle={onUpdateTitle}
        onDragStartCard={onDragStartCard}
        onDragEnd={onDragEnd}
        onDragOverCard={onDragOverCard}
        onDropCard={(e, id) => onDropCard(e, group, id)}
        onMoveColumn={onMoveColumn}
        onAddItem={onAddItem}
      />
    </div>
  )
})

function AddColumnButton({ onAddColumn }: { onAddColumn: () => void }) {
  return (
    <div className='w-64 shrink-0 pt-1'>
      <button
        type='button'
        onClick={onAddColumn}
        className='flex w-full items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-3 text-[length:var(--text-13)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
      >
        <Plus size={15} />
        <span>{t('preview.kanban_new_group')}</span>
      </button>
    </div>
  )
}

function useKanbanGroups(
  data: KanbanData,
  view: KanbanView,
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void,
) {
  const groupPropertyId = view.groupBy || 'status'
  const groupProperty = data.columns.find((c) => c.id === groupPropertyId)
  const groups = groupKanbanItems(data.items, groupPropertyId, groupProperty)

  const handleMoveColumn = (itemId: string, currentGroupKey: string, direction: 'prev' | 'next') => {
    const currentIndex = groups.findIndex((g) => g.groupKey === currentGroupKey)
    if (currentIndex === -1) return
    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1
    if (targetIndex >= 0 && targetIndex < groups.length) {
      onMoveItem(itemId, groups[targetIndex]!.groupKey)
    }
  }

  return { groups, handleMoveColumn }
}

interface BoardColumnItemProps {
  group: ReturnType<typeof groupKanbanItems>[number]
  columns: KanbanData['columns']
  isCollapsed: boolean
  isDragOver: boolean
  cardSize?: CardSize
  selectedIds: Set<string>
  cardDropTarget: CardDropTarget | null
  dnd: ReturnType<typeof useKanbanBoardDndState>
  onToggleCollapse: (groupKey: string) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: (groupKey: string) => void
  onUpdateColumn?: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  onDeleteColumn?: (groupKey: string) => void
}

function BoardColumnItem({
  group,
  columns,
  isCollapsed,
  isDragOver,
  cardSize,
  selectedIds,
  cardDropTarget,
  dnd,
  onToggleCollapse,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onMoveColumn,
  onAddItem,
  onUpdateColumn,
  onDeleteColumn,
}: BoardColumnItemProps) {
  if (isCollapsed) {
    return (
      <CollapsedColumn
        group={group}
        isDragOver={isDragOver}
        onExpand={() => onToggleCollapse(group.groupKey)}
        onDragOver={(e) => {
          e.preventDefault()
          dnd.setDragOverGroupKey(group.groupKey)
        }}
        onDrop={(e) => dnd.handleColumnDrop(e, group.groupKey)}
      />
    )
  }

  return (
    <KanbanBoardColumn
      group={group}
      columns={columns}
      selectedIds={selectedIds}
      cardSize={cardSize}
      cardDropTarget={cardDropTarget}
      isDragOver={isDragOver}
      onDragOver={(e) => {
        e.preventDefault()
        dnd.setDragOverGroupKey(group.groupKey)
      }}
      onDrop={(e) => dnd.handleColumnDrop(e, group.groupKey)}
      onDragStartCard={dnd.handleCardDragStart}
      onDragEnd={dnd.handleDragEnd}
      onDragOverCard={dnd.handleCardDragOver}
      onDropCard={dnd.handleCardDrop}
      onDragStartColumn={(e) => dnd.handleColumnDragStart(e, group.groupKey)}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
      onUpdateTitle={onUpdateTitle}
      onMoveColumn={onMoveColumn}
      onAddItem={() => onAddItem(group.groupKey)}
      onRenameColumn={(newLabel) => onUpdateColumn?.(group.groupKey, { label: newLabel })}
      onChangeColumnColor={(newColor) => onUpdateColumn?.(group.groupKey, { color: newColor })}
      onCollapseColumn={() => onToggleCollapse(group.groupKey)}
      onDeleteColumn={onDeleteColumn ? () => onDeleteColumn(group.groupKey) : undefined}
    />
  )
}

export const KanbanBoardView = memo(function KanbanBoardView(props: KanbanBoardViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const dnd = useKanbanBoardDndState(props.onMoveItem, props.onReorderColumns)
  const { groups, handleMoveColumn } = useKanbanGroups(props.data, props.view, props.onMoveItem)

  const toggleCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  return (
    <div className='flex h-full w-full gap-4 overflow-x-auto p-4' role='region' aria-label={t('preview.kanban_view_board')}>
      {groups.map((group) => (
        <BoardColumnItem
          key={group.groupKey}
          group={group}
          columns={props.data.columns}
          isCollapsed={collapsedGroups.has(group.groupKey)}
          isDragOver={dnd.dragOverGroupKey === group.groupKey}
          cardSize={props.cardSize}
          selectedIds={props.selectedIds}
          cardDropTarget={dnd.cardDropTarget}
          dnd={dnd}
          onToggleCollapse={toggleCollapse}
          onToggleSelect={props.onToggleSelect}
          onOpenDetail={props.onOpenDetail}
          onUpdateTitle={props.onUpdateTitle}
          onMoveColumn={(itemId, dir) => handleMoveColumn(itemId, group.groupKey, dir)}
          onAddItem={props.onAddItem}
          onUpdateColumn={props.onUpdateColumn}
          onDeleteColumn={props.onDeleteColumn}
        />
      ))}
      <AddColumnButton onAddColumn={props.onAddColumn} />
    </div>
  )
})

