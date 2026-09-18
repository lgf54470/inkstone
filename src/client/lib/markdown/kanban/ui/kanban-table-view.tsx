import { memo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { groupKanbanItems } from '../filter-sort'
import type { KanbanData, KanbanFile, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask, KanbanView } from '../types'
import { KanbanTableHeaderCell, kanbanPropertyColumns, kanbanTitleColumn } from './kanban-property-cell'
import { KanbanTableGroup } from './kanban-table-group'

interface KanbanTableViewProps {
  data: KanbanData
  view?: KanbanView
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProperty: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateMultiSelect: (itemId: string, columnId: string, values: string[], newOption?: KanbanOption) => void
  onUpdateSubtasks?: (itemId: string, subtasks: KanbanSubtask[]) => void
  onUpdateFiles: (itemId: string, files: KanbanFile[]) => void
  onAddItem: (propertyDefaults?: Record<string, unknown>) => void
  onAddColumn: () => void
}

interface TableHeaderRowProps {
  columns: KanbanProperty[]
  isAllSelected: boolean
  onToggleAll: () => void
}

function TableHeaderRow({ columns, isAllSelected, onToggleAll }: TableHeaderRowProps) {
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
      <KanbanTableHeaderCell column={kanbanTitleColumn(columns)} />
      {kanbanPropertyColumns(columns).map((column) => (
        <KanbanTableHeaderCell key={column.id} column={column} />
      ))}
    </div>
  )
}

function useTableToggleAll(
  items: KanbanItem[],
  selectedIds: Set<string>,
  onToggleAll: (ids: string[]) => void,
) {
  const isAllSelected = items.length > 0 && selectedIds.size === items.length
  // One batch commit: per-row toggles would queue one state update per item.
  const handleToggleAll = () => onToggleAll(items.map((item) => item.id))
  return { isAllSelected, handleToggleAll }
}

export const KanbanTableView = memo(function KanbanTableView({
  data,
  view,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
  onUpdateProperty,
  onUpdateMultiSelect,
  onUpdateSubtasks,
  onUpdateFiles,
  onAddItem,
  onAddColumn,
}: KanbanTableViewProps) {
  const groupByProp = view?.groupBy || 'status'
  const groupCol = data.columns.find((c) => c.id === groupByProp)
  const groups = groupKanbanItems(data.items, groupByProp, groupCol)
  const { isAllSelected, handleToggleAll } = useTableToggleAll(data.items, selectedIds, onToggleAll)

  return (
    <div className='h-full w-full overflow-auto p-4' role='region' aria-label={t('preview.kanban_view_table')}>
      <div className='w-full min-w-max rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <TableHeaderRow columns={data.columns} isAllSelected={isAllSelected} onToggleAll={handleToggleAll} />
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
              onUpdateMultiSelect={onUpdateMultiSelect}
              onUpdateSubtasks={onUpdateSubtasks}
              onUpdateFiles={onUpdateFiles}
              onAddItemInGroup={() => {
                const defaults = group.groupKey !== '__none__' ? { [groupByProp]: group.groupKey } : {}
                onAddItem(defaults)
              }}
            />
          ))}

          <button
            type='button'
            onClick={onAddColumn}
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
