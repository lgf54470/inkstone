import { memo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { groupKanbanItems } from '../filter-sort'
import type { KanbanData, KanbanItem, KanbanSubtask, KanbanView } from '../types'
import { KanbanTableGroup } from './kanban-table-group'

interface KanbanTableViewProps {
  data: KanbanData
  view?: KanbanView
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProperty?: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateSubtasks?: (itemId: string, subtasks: KanbanSubtask[]) => void
  onAddItem: (propertyDefaults?: Record<string, unknown>) => void
  onAddColumn?: () => void
  onAddGroup?: () => void
}

interface TableHeaderRowProps {
  isAllSelected: boolean
  onToggleAll: () => void
}

function TableHeaderRow({ isAllSelected, onToggleAll }: TableHeaderRowProps) {
  return (
    <div className='flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
      <div className='w-10 shrink-0 p-2.5 text-center'>
        <input
          type='checkbox'
          checked={isAllSelected}
          onChange={onToggleAll}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          aria-label={t('preview.kanban_select_all')}
        />
      </div>
      <div className='flex flex-1 min-w-48 items-center border-l border-[var(--border-subtle)] px-3 py-2'>
        <span>{t('preview.kanban_task_name')}</span>
      </div>
      <div className='w-20 shrink-0 border-l border-[var(--border-subtle)] px-2 py-2 text-center'>
        <span>{t('preview.kanban_owner')}</span>
      </div>
      <div className='w-36 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2 text-center'>
        <span>{t('preview.kanban_prop_status')}</span>
      </div>
      <div className='w-32 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2'>
        <span>{t('preview.kanban_due_date')}</span>
      </div>
      <div className='w-32 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2'>
        <span>{t('preview.kanban_timeline')}</span>
      </div>
      <div className='w-40 shrink-0 border-l border-[var(--border-subtle)] px-3 py-2 text-center'>
        <span>{t('preview.kanban_files')}</span>
      </div>
    </div>
  )
}

function useTableToggleAll(
  items: KanbanItem[],
  selectedIds: Set<string>,
  onToggleSelect: (id: string) => void,
) {
  const isAllSelected = items.length > 0 && selectedIds.size === items.length
  const handleToggleAll = () => {
    const shouldSelectAll = !isAllSelected
    for (const item of items) {
      if (shouldSelectAll && !selectedIds.has(item.id)) {
        onToggleSelect(item.id)
      } else if (!shouldSelectAll && selectedIds.has(item.id)) {
        onToggleSelect(item.id)
      }
    }
  }
  return { isAllSelected, handleToggleAll }
}

export const KanbanTableView = memo(function KanbanTableView({
  data,
  view,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onUpdateProperty,
  onUpdateSubtasks,
  onAddItem,
  onAddGroup,
}: KanbanTableViewProps) {
  const groupByProp = view?.groupBy || 'status'
  const groupCol = data.columns.find((c) => c.id === groupByProp)
  const groups = groupKanbanItems(data.items, groupByProp, groupCol)
  const { isAllSelected, handleToggleAll } = useTableToggleAll(data.items, selectedIds, onToggleSelect)

  return (
    <div className='h-full w-full overflow-auto p-4' role='region' aria-label={t('preview.kanban_view_table')}>
      <div className='w-full min-w-max rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <TableHeaderRow isAllSelected={isAllSelected} onToggleAll={handleToggleAll} />
        <div className='p-3'>
          {groups.map((group) => (
            <KanbanTableGroup
              key={group.groupKey}
              groupKey={group.groupKey}
              label={group.label}
              color={group.color}
              items={group.items}
              columns={data.columns}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onOpenDetail={onOpenDetail}
              onUpdateProperty={onUpdateProperty}
              onUpdateSubtasks={onUpdateSubtasks}
              onAddItemInGroup={() => {
                const defaults = group.groupKey !== '__none__' ? { [groupByProp]: group.groupKey } : {}
                onAddItem(defaults)
              }}
            />
          ))}

          <button
            type='button'
            onClick={() => (onAddGroup ? onAddGroup() : onAddItem())}
            className='flex items-center gap-1.5 rounded-[var(--r-md)] border border-dashed border-[var(--border-default)] px-3 py-1.5 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]'
          >
            <Plus size={14} />
            <span>+ {t('preview.kanban_add_new_group')}</span>
          </button>
        </div>
      </div>
    </div>
  )
})
