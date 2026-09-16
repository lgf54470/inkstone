import { memo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty } from '../types'

interface KanbanListViewProps {
  data: KanbanData
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}

interface KanbanListRowProps {
  item: KanbanItem
  statusCol?: KanbanProperty
  priorityCol?: KanbanProperty
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
}

function KanbanListRow({
  item,
  statusCol,
  priorityCol,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: KanbanListRowProps) {
  const statusVal = item.properties.status
  const statusOpt = statusCol?.options?.find((o: KanbanOption) => o.id === statusVal || o.label === statusVal)
  const priorityVal = item.properties.priority
  const priorityOpt = priorityCol?.options?.find((o: KanbanOption) => o.id === priorityVal || o.label === priorityVal)

  return (
    <div
      onClick={() => onOpenDetail(item)}
      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)] ${
        isSelected ? 'bg-[var(--accent-softer)]' : ''
      }`}
    >
      <div className='flex min-w-0 items-center gap-2.5'>
        <input
          type='checkbox'
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(item.id)}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          aria-label={t('preview.kanban_select_card')}
        />
        {item.icon && <span className='text-[length:var(--text-14)]'>{item.icon}</span>}
        <span className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          {item.title}
        </span>
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        {statusOpt && (
          <span
            style={getKanbanTagStyle(statusOpt.color)}
            className='inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            {formatKanbanOptionLabel(statusOpt, 'status')}
          </span>
        )}
        {priorityOpt && (
          <span
            style={getKanbanTagStyle(priorityOpt.color)}
            className='inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            {formatKanbanOptionLabel(priorityOpt, 'priority')}
          </span>
        )}
      </div>
    </div>
  )
}

export const KanbanListView = memo(function KanbanListView({
  data,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onAddItem,
}: KanbanListViewProps) {
  const statusCol = data.columns.find((c) => c.id === 'status')
  const priorityCol = data.columns.find((c) => c.id === 'priority')

  return (
    <div className='flex h-full w-full flex-col overflow-y-auto p-4' role='region' aria-label={t('preview.kanban_view_list')}>
      <div className='divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        {data.items.map((item) => (
          <KanbanListRow
            key={item.id}
            item={item}
            statusCol={statusCol}
            priorityCol={priorityCol}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
          />
        ))}

        <div className='p-2'>
          <button
            type='button'
            onClick={onAddItem}
            className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          >
            <Plus size={13} />
            <span>{t('preview.kanban_new_item')}</span>
          </button>
        </div>
      </div>
    </div>
  )
})
