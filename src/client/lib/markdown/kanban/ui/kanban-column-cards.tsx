import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import type { KanbanData, KanbanItem, KanbanOption, KanbanSubtask } from '../types'
import { KanbanCard, type CardMoveDirection } from './kanban-card'
import { KanbanRenderTail, useKanbanRenderWindow } from './kanban-render-window'
import type { CardDropTarget } from './kanban-board-dnd'
import type { CardSize } from './kanban-view-options'

/**
 * What a column draws once its header is behind it: the cards, whatever it is holding back, and the
 * door to add one. It lives apart from the board so the board can stay a description of where columns
 * go — and so the render window (the 30 cards a column mounts at a time) has one owner rather than
 * one per surface that lists cards.
 */
export interface ColumnCardsListProps {
  items: KanbanItem[]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  cardDropTarget: CardDropTarget | null
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onDragStartCard: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent, id: string) => void
  onDropCard: (e: React.DragEvent, id: string) => void
  onMoveColumn: (itemId: string, dir: CardMoveDirection) => void
  onAddItem: () => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

export function ColumnCardsList(props: ColumnCardsListProps) {
  const { visible, hiddenCount, setTailElement, revealMore } = useKanbanRenderWindow(props.items)
  return (
    <div className='mt-2 flex flex-1 flex-col gap-2 overflow-y-auto'>
      {props.items.length === 0 ? (
        <div className='flex h-20 items-center justify-center rounded-[var(--r-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/50 text-[length:var(--text-12)] font-medium text-[var(--text-tertiary)]'>
          {t('preview.kanban_empty_column')}
        </div>
      ) : (
        visible.map((item) => (
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
            // The card passes its own id, so the column can hand the same handler to all of them.
            onDragStart={props.onDragStartCard}
            onDragEnd={props.onDragEnd}
            onDragOverCard={props.onDragOverCard}
            onDropOnCard={props.onDropCard}
            onMoveColumn={props.onMoveColumn}
            onUpdateTags={props.onUpdateTags}
            onAddColumnOption={props.onAddColumnOption}
          />
        ))
      )}

      <KanbanRenderTail hiddenCount={hiddenCount} setTailElement={setTailElement} onReveal={revealMore} />

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
