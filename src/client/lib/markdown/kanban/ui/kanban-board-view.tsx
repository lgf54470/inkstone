import { memo, useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import { groupKanbanItems } from '../filter-sort'
import type { KanbanData, KanbanItem, KanbanView } from '../types'
import { KanbanCard } from './kanban-card'

interface KanbanBoardViewProps {
  data: KanbanData
  view: KanbanView
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void
  onAddItem: (groupKey?: string) => void
  onAddColumn: () => void
}

interface KanbanBoardColumnProps {
  group: ReturnType<typeof groupKanbanItems>[number]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onMoveColumn: (itemId: string, dir: 'prev' | 'next') => void
  onAddItem: () => void
}

function KanbanColumnHeader({ label, count, color }: { label: string; count: number; color?: string }) {
  const dotColor = getKanbanDotColor(color)
  return (
    <div className='flex items-center justify-between px-2 py-1.5'>
      <div className='flex items-center gap-2'>
        {dotColor && <span className='h-2.5 w-2.5 rounded-full' style={{ backgroundColor: dotColor }} />}
        <span className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
          {label}
        </span>
        <span className='rounded-[var(--r-full)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {count}
        </span>
      </div>
      <button
        type='button'
        className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={label}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}

const KanbanBoardColumn = memo(function KanbanBoardColumn({
  group,
  columns,
  selectedIds,
  isDragOver,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onMoveColumn,
  onAddItem,
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
        label={group.label}
        count={group.items.length}
        color={group.color}
      />

      <div className='mt-2 flex flex-1 flex-col gap-2 overflow-y-auto'>
        {group.items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            columns={columns}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
            onUpdateTitle={onUpdateTitle}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMoveColumn={(_id, dir) => onMoveColumn(item.id, dir)}
          />
        ))}

        <button
          type='button'
          onClick={onAddItem}
          className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Plus size={13} />
          <span>{t('preview.kanban_new_item')}</span>
        </button>
      </div>
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

function useKanbanBoardDnd(onMoveItem: (itemId: string, targetGroupKey: string) => void) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null)

  const handleDragStart = (_e: React.DragEvent, id: string) => {
    setDraggedItemId(id)
  }
  const handleDragEnd = () => {
    setDraggedItemId(null)
    setDragOverGroupKey(null)
  }
  const handleDragOver = (e: React.DragEvent, groupKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverGroupKey !== groupKey) {
      setDragOverGroupKey(groupKey)
    }
  }
  const handleDrop = (e: React.DragEvent, groupKey: string) => {
    e.preventDefault()
    if (draggedItemId) {
      onMoveItem(draggedItemId, groupKey)
    }
    setDraggedItemId(null)
    setDragOverGroupKey(null)
  }

  return { dragOverGroupKey, handleDragStart, handleDragEnd, handleDragOver, handleDrop }
}

export const KanbanBoardView = memo(function KanbanBoardView({
  data,
  view,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onUpdateTitle,
  onMoveItem,
  onAddItem,
  onAddColumn,
}: KanbanBoardViewProps) {
  const { dragOverGroupKey, handleDragStart, handleDragEnd, handleDragOver, handleDrop } =
    useKanbanBoardDnd(onMoveItem)

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

  return (
    <div className='flex h-full w-full gap-4 overflow-x-auto p-4' role='region' aria-label={t('preview.kanban_view_board')}>
      {groups.map((group) => (
        <KanbanBoardColumn
          key={group.groupKey}
          group={group}
          columns={data.columns}
          selectedIds={selectedIds}
          isDragOver={dragOverGroupKey === group.groupKey}
          onDragOver={(e) => handleDragOver(e, group.groupKey)}
          onDrop={(e) => handleDrop(e, group.groupKey)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onToggleSelect={onToggleSelect}
          onOpenDetail={onOpenDetail}
          onUpdateTitle={onUpdateTitle}
          onMoveColumn={(itemId, dir) => handleMoveColumn(itemId, group.groupKey, dir)}
          onAddItem={() => onAddItem(group.groupKey)}
        />
      ))}
      <AddColumnButton onAddColumn={onAddColumn} />
    </div>
  )
})
