import { memo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty } from '../types'

interface KanbanTableViewProps {
  data: KanbanData
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProperty?: (itemId: string, propertyId: string, value: unknown) => void
  onAddItem: () => void
  onAddColumn: () => void
}

interface TableHeaderRowProps {
  columns: KanbanProperty[]
  isAllSelected: boolean
  onToggleAll: () => void
  onAddColumn: () => void
}

function TableHeaderRow({ columns, isAllSelected, onToggleAll, onAddColumn }: TableHeaderRowProps) {
  return (
    <div className='flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-raised)] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
      <div className='w-10 shrink-0 p-2.5 text-center'>
        <input
          type='checkbox'
          checked={isAllSelected}
          onChange={onToggleAll}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          aria-label={t('preview.kanban_select_all')}
        />
      </div>
      {columns.map((col) => (
        <div key={col.id} className='flex-1 min-w-32 border-l border-[var(--border-subtle)] px-3 py-2'>
          {col.name}
        </div>
      ))}
      <div className='w-10 shrink-0 border-l border-[var(--border-subtle)] p-2 text-center'>
        <button
          type='button'
          onClick={onAddColumn}
          className='inline-flex size-6 items-center justify-center rounded-[var(--r-xs)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          aria-label={t('preview.kanban_add_column')}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

function TableCell({
  column,
  item,
  onOpenDetail,
}: {
  column: KanbanProperty
  item: KanbanItem
  onOpenDetail: () => void
}) {
  const val = column.id === 'title' ? item.title : item.properties[column.id]
  const opt = column.options?.find((o: KanbanOption) => o.id === val || o.label === val)

  return (
    <div
      onClick={onOpenDetail}
      className='flex-1 min-w-32 cursor-pointer truncate border-l border-[var(--border-subtle)] px-3 py-2'
    >
      {opt ? (
        <span
          style={getKanbanTagStyle(opt.color)}
          className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
        >
          {opt.label}
        </span>
      ) : (
        <span className='text-[var(--text-primary)]'>{String(val ?? '')}</span>
      )}
    </div>
  )
}

function TableRow({
  item,
  columns,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: {
  item: KanbanItem
  columns: KanbanProperty[]
  isSelected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
}) {
  return (
    <div
      className={`flex items-center text-[length:var(--text-13)] hover:bg-[var(--bg-hover)] ${
        isSelected ? 'bg-[var(--accent-softer)]' : ''
      }`}
    >
      <div className='w-10 shrink-0 p-2.5 text-center'>
        <input
          type='checkbox'
          checked={isSelected}
          onChange={onToggleSelect}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          aria-label={t('preview.kanban_select_card')}
        />
      </div>
      {columns.map((col) => (
        <TableCell key={col.id} column={col} item={item} onOpenDetail={onOpenDetail} />
      ))}
      <div className='w-10 shrink-0 border-l border-[var(--border-subtle)]' />
    </div>
  )
}

function TableAddRow({ onAddItem }: { onAddItem: () => void }) {
  return (
    <div className='border-t border-[var(--border-subtle)] p-2'>
      <button
        type='button'
        onClick={onAddItem}
        className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <Plus size={13} />
        <span>{t('preview.kanban_new_item')}</span>
      </button>
    </div>
  )
}

export const KanbanTableView = memo(function KanbanTableView({
  data,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onAddItem,
  onAddColumn,
}: KanbanTableViewProps) {
  const isAllSelected = data.items.length > 0 && selectedIds.size === data.items.length

  const handleToggleAll = () => {
    const shouldSelectAll = !isAllSelected
    for (const item of data.items) {
      if (shouldSelectAll && !selectedIds.has(item.id)) {
        onToggleSelect(item.id)
      } else if (!shouldSelectAll && selectedIds.has(item.id)) {
        onToggleSelect(item.id)
      }
    }
  }

  return (
    <div className='h-full w-full overflow-auto p-4' role='region' aria-label={t('preview.kanban_view_table')}>
      <div className='w-full min-w-max rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        <TableHeaderRow
          columns={data.columns}
          isAllSelected={isAllSelected}
          onToggleAll={handleToggleAll}
          onAddColumn={onAddColumn}
        />
        <div className='divide-y divide-[var(--border-subtle)]'>
          {data.items.map((item) => (
            <TableRow
              key={item.id}
              item={item}
              columns={data.columns}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={() => onToggleSelect(item.id)}
              onOpenDetail={() => onOpenDetail(item)}
            />
          ))}
        </div>
        <TableAddRow onAddItem={onAddItem} />
      </div>
    </div>
  )
})
