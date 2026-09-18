import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanFile, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanProgressBar } from './kanban-progress-bar'
import { KanbanTableRow } from './kanban-table-row'

interface KanbanTableGroupProps {
  groupKey: string
  label: string
  color?: KanbanColorName
  items: KanbanItem[]
  columns: KanbanProperty[]
  hiddenColumns?: string[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateProperty: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateMultiSelect: (itemId: string, columnId: string, values: string[], newOption?: KanbanOption) => void
  onUpdateSubtasks?: (itemId: string, subtasks: KanbanSubtask[]) => void
  onUpdateFiles: (itemId: string, files: KanbanFile[]) => void
  onAddItemInGroup: () => void
}

function GroupHeader({
  collapsed,
  localizedLabel,
  color,
  count,
  onToggleCollapse,
  onAddItem,
}: {
  collapsed: boolean
  localizedLabel: string
  color?: KanbanColorName
  count: number
  onToggleCollapse: () => void
  onAddItem: () => void
}) {
  const colorVar = color ? `var(--kanban-tag-${color}-fg)` : 'var(--accent)'
  return (
    <div className='flex items-center justify-between border-y border-[var(--border-subtle)] bg-[var(--bg-raised)] px-3 py-2 text-[length:var(--text-13)] font-semibold'>
      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={onToggleCollapse}
          className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <span style={{ color: colorVar }}>{localizedLabel}</span>
        <span className='rounded-[var(--r-full)] bg-[var(--bg-hover)] px-2 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {count}
        </span>
      </div>

      <button
        type='button'
        onClick={onAddItem}
        className='flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]'
      >
        <Plus size={13} />
        <span>{t('preview.kanban_new_item')}</span>
      </button>
    </div>
  )
}

const GROUP_PROGRESS_HEIGHT = 6

function GroupFooter({
  items,
  columns,
  onAddItem,
}: {
  items: KanbanItem[]
  columns: KanbanProperty[]
  onAddItem: () => void
}) {
  const statusCol = columns.find((c) => c.id === 'status')
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-11)]'>
      <button
        type='button'
        onClick={onAddItem}
        className='flex items-center gap-1.5 text-[var(--text-tertiary)] hover:text-[var(--accent)]'
      >
        <Plus size={13} />
        <span>+ {t('preview.kanban_new_item')}</span>
      </button>

      <div className='w-48'>
        <KanbanProgressBar items={items} statusColumn={statusCol} height={GROUP_PROGRESS_HEIGHT} />
      </div>
    </div>
  )
}

export function KanbanTableGroup({
  groupKey,
  label,
  color,
  items,
  columns,
  hiddenColumns,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onUpdateProperty,
  onUpdateMultiSelect,
  onUpdateSubtasks,
  onUpdateFiles,
  onAddItemInGroup,
}: KanbanTableGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const localizedLabel = formatKanbanGroupLabel(groupKey, label)

  return (
    <div className='mb-6 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] shadow-2xs'>
      <GroupHeader
        collapsed={collapsed}
        localizedLabel={localizedLabel}
        color={color}
        count={items.length}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onAddItem={onAddItemInGroup}
      />

      {!collapsed && (
        <>
          <div className='flex flex-col'>
            {items.map((item) => (
              <KanbanTableRow
                key={item.id}
                item={item}
                columns={columns}
                hiddenColumns={hiddenColumns}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={() => onToggleSelect(item.id)}
                onOpenDetail={() => onOpenDetail(item)}
                onUpdateProperty={onUpdateProperty}
                onUpdateMultiSelect={onUpdateMultiSelect}
                onUpdateSubtasks={onUpdateSubtasks}
                onUpdateFiles={onUpdateFiles}
              />
            ))}
          </div>
          <GroupFooter items={items} columns={columns} onAddItem={onAddItemInGroup} />
        </>
      )}
    </div>
  )
}
