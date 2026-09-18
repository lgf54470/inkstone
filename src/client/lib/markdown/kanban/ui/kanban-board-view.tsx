import { memo, useState } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { groupKanbanItems } from '../filter-sort'
import type { KanbanMovePivot } from '../dnd'
import type { KanbanColorName, KanbanData, KanbanItem, KanbanOption, KanbanSubtask, KanbanView } from '../types'
import { useKanbanBoardDndState, type CardDropTarget } from './kanban-board-dnd'
import { KanbanCard } from './kanban-card'
import { CollapsedColumn, KanbanColumnHeader } from './kanban-column-header'
import type { CardSize } from './kanban-view-options'

interface KanbanBoardViewProps {
  data: KanbanData
  view: KanbanView
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void
  onAddItem: (groupKey?: string) => void
  onAddColumn: () => void
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void
  onUpdateColumn?: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  onDeleteColumn?: (groupKey: string) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

interface ColumnCardsListProps {
  items: KanbanItem[]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  cardDropTarget: CardDropTarget | null
  groupKey: string
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onDragStartCard: (e: React.DragEvent, id: string, sourceGroupKey: string) => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent, id: string) => void
  onDropCard: (e: React.DragEvent, id: string) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: () => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function ColumnCardsList(props: ColumnCardsListProps) {
  return (
    <div className='mt-2 flex flex-1 flex-col gap-2 overflow-y-auto'>
      {props.items.length === 0 ? (
        <div className='flex h-20 items-center justify-center rounded-[var(--r-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/50 text-[length:var(--text-12)] font-medium text-[var(--text-tertiary)]'>
          {t('preview.kanban_empty_column')}
        </div>
      ) : (
        props.items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            columns={props.columns}
            isSelected={props.selectedIds.has(item.id)}
            cardSize={props.cardSize}
            selectedTags={props.selectedTags}
            dropIndicator={props.cardDropTarget?.cardId === item.id ? props.cardDropTarget.position : null}
            onToggleSelect={props.onToggleSelect}
            onOpenDetail={props.onOpenDetail}
            onToggleTag={props.onToggleTag}
            onUpdateTitle={props.onUpdateTitle}
            onUpdateSubtasks={props.onUpdateSubtasks}
            onDragStart={(e) => props.onDragStartCard(e, item.id, props.groupKey)}
            onDragEnd={props.onDragEnd}
            onDragOverCard={props.onDragOverCard}
            onDropOnCard={props.onDropCard}
            onMoveColumn={(_id, dir) => props.onMoveColumn(item.id, dir)}
            onUpdateTags={props.onUpdateTags}
            onAddColumnOption={props.onAddColumnOption}
          />
        ))
      )}

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
  selectedTags?: string[]
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
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: () => void
  onRenameColumn: (newLabel: string) => void
  onChangeColumnColor: (newColor: KanbanColorName) => void
  onCollapseColumn: () => void
  onDeleteColumn?: () => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

const KanbanBoardColumn = memo(function KanbanBoardColumn({
  group,
  columns,
  selectedIds,
  cardSize,
  selectedTags,
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
  onToggleTag,
  onUpdateTitle,
  onUpdateSubtasks,
  onMoveColumn,
  onAddItem,
  onRenameColumn,
  onChangeColumnColor,
  onCollapseColumn,
  onDeleteColumn,
  onUpdateTags,
  onAddColumnOption,
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
        selectedTags={selectedTags}
        cardDropTarget={cardDropTarget}
        groupKey={group.groupKey}
        onToggleSelect={onToggleSelect}
        onOpenDetail={onOpenDetail}
        onToggleTag={onToggleTag}
        onUpdateTitle={onUpdateTitle}
        onUpdateSubtasks={onUpdateSubtasks}
        onDragStartCard={onDragStartCard}
        onDragEnd={onDragEnd}
        onDragOverCard={onDragOverCard}
        onDropCard={(e, id) => onDropCard(e, group, id)}
        onMoveColumn={onMoveColumn}
        onAddItem={onAddItem}
        onUpdateTags={onUpdateTags}
        onAddColumnOption={onAddColumnOption}
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
  onMoveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void,
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
  selectedTags?: string[]
  cardDropTarget: CardDropTarget | null
  dnd: ReturnType<typeof useKanbanBoardDndState>
  onToggleCollapse: (groupKey: string) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: (groupKey: string) => void
  onUpdateColumn?: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  onDeleteColumn?: (groupKey: string) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function CollapsedColumnItem({
  group,
  isDragOver,
  dnd,
  onToggleCollapse,
}: {
  group: ReturnType<typeof groupKanbanItems>[number]
  isDragOver: boolean
  dnd: ReturnType<typeof useKanbanBoardDndState>
  onToggleCollapse: (key: string) => void
}) {
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

function ExpandedBoardColumn(props: BoardColumnItemProps) {
  const { group, dnd } = props
  return (
    <KanbanBoardColumn
      group={group}
      columns={props.columns}
      selectedIds={props.selectedIds}
      cardSize={props.cardSize}
      selectedTags={props.selectedTags}
      cardDropTarget={props.cardDropTarget}
      isDragOver={props.isDragOver}
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
      onToggleSelect={props.onToggleSelect}
      onOpenDetail={props.onOpenDetail}
      onToggleTag={props.onToggleTag}
      onUpdateTitle={props.onUpdateTitle}
      onUpdateSubtasks={props.onUpdateSubtasks}
      onMoveColumn={props.onMoveColumn}
      onAddItem={() => props.onAddItem(group.groupKey)}
      onRenameColumn={(newLabel) => props.onUpdateColumn?.(group.groupKey, { label: newLabel })}
      onChangeColumnColor={(newColor) => props.onUpdateColumn?.(group.groupKey, { color: newColor })}
      onCollapseColumn={() => props.onToggleCollapse(group.groupKey)}
      onDeleteColumn={() => props.onDeleteColumn?.(group.groupKey)}
      onUpdateTags={props.onUpdateTags}
      onAddColumnOption={props.onAddColumnOption}
    />
  )
}

function BoardColumnItem(props: BoardColumnItemProps) {
  if (props.isCollapsed) {
    return (
      <CollapsedColumnItem
        group={props.group}
        isDragOver={props.isDragOver}
        dnd={props.dnd}
        onToggleCollapse={props.onToggleCollapse}
      />
    )
  }
  return <ExpandedBoardColumn {...props} />
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
          selectedTags={props.selectedTags}
          cardDropTarget={dnd.cardDropTarget}
          dnd={dnd}
          onToggleCollapse={toggleCollapse}
          onToggleSelect={props.onToggleSelect}
          onOpenDetail={props.onOpenDetail}
          onToggleTag={props.onToggleTag}
          onUpdateTitle={props.onUpdateTitle}
          onUpdateSubtasks={props.onUpdateSubtasks}
          onMoveColumn={(itemId, dir) => handleMoveColumn(itemId, group.groupKey, dir)}
          onAddItem={props.onAddItem}
          onUpdateColumn={props.onUpdateColumn}
          onDeleteColumn={props.onDeleteColumn}
          onUpdateTags={props.onUpdateTags}
          onAddColumnOption={props.onAddColumnOption}
        />
      ))}
      <AddColumnButton onAddColumn={props.onAddColumn} />
    </div>
  )
})

