import { Flag, Trash2 } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanDotColor, getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanItem, KanbanOption, KanbanProperty } from '../types'
import { KanbanDatePicker } from './kanban-date-picker'
import { KanbanFilesCell } from './kanban-files-cell'
import { KanbanSubtaskList } from './kanban-subtask-list'

export function StatusOptionItem({
  option,
  isSelected,
  onSelect,
}: {
  option: KanbanOption
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type='button'
      role='option'
      aria-selected={isSelected}
      onClick={() => onSelect(option.id)}
      className={`flex w-full items-center gap-2 rounded-[var(--r-xs)] px-2.5 py-1.5 text-left text-[length:var(--text-12)] font-medium transition-colors hover:bg-[var(--bg-hover)] ${
        isSelected ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]'
      }`}
    >
      <span
        className='size-2 rounded-full shrink-0'
        style={{ backgroundColor: getKanbanDotColor(option.color) }}
      />
      <span>{formatKanbanOptionLabel(option, 'status')}</span>
    </button>
  )
}

export function PriorityChips({
  priorityCol,
  currentPriority,
  onChangePriority,
}: {
  priorityCol?: KanbanProperty
  currentPriority?: unknown
  onChangePriority: (val: string) => void
}) {
  const options: KanbanOption[] = priorityCol?.options ?? [
    { id: 'low', label: 'low', color: 'green' },
    { id: 'medium', label: 'medium', color: 'yellow' },
    { id: 'high', label: 'high', color: 'red' },
  ]

  return (
    <div className='flex flex-col gap-1.5'>
      <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
        {t('preview.kanban_prop_priority')}
      </label>
      <div className='flex flex-wrap items-center gap-1.5'>
        {options.map((opt) => {
          const isSelected = currentPriority === opt.id || currentPriority === opt.label
          return (
            <button
              key={opt.id}
              type='button'
              onClick={() => onChangePriority(isSelected ? '' : opt.id)}
              style={isSelected ? getKanbanTagStyle(opt.color) : undefined}
              className={`inline-flex items-center gap-1 rounded-[var(--r-xs)] px-2.5 py-1 text-[length:var(--text-12)] font-medium transition-colors ${
                isSelected
                  ? 'shadow-2xs ring-1 ring-[var(--accent-soft)]'
                  : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Flag size={11} />
              <span>{formatKanbanOptionLabel(opt, 'priority')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DetailFooter({ onDelete, onClose }: { onDelete: () => void; onClose: () => void }) {
  return (
    <div className='flex w-full items-center justify-between'>
      <button
        type='button'
        onClick={onDelete}
        className='inline-flex items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1.5 text-[length:var(--text-12)] text-[var(--danger)] hover:bg-[var(--bg-hover)]'
      >
        <Trash2 size={14} />
        <span>{t('preview.kanban_delete_card')}</span>
      </button>
      <button
        type='button'
        onClick={onClose}
        className='rounded-[var(--r-md)] bg-[var(--bg-raised)] border border-[var(--border-default)] px-3 py-1.5 text-[length:var(--text-12)] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      >
        {t('preview.kanban_done')}
      </button>
    </div>
  )
}

export function DetailPropertyField({
  column,
  value,
  onChange,
}: {
  column: KanbanProperty
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (column.type === 'date') {
    return (
      <div className='flex flex-col gap-1'>
        <label className='text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
          {formatKanbanPropertyName(column)}
        </label>
        <KanbanDatePicker value={String(value ?? '')} onChange={onChange} />
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-1'>
      <label className='text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {formatKanbanPropertyName(column)}
      </label>
      {column.type === 'number' ? (
        <input
          type='number'
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        />
      ) : (
        <input
          type='text'
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        />
      )}
    </div>
  )
}

export function DetailDescription({
  content,
  onChange,
}: {
  content?: string
  onChange: (text: string) => void
}) {
  return (
    <div className='flex flex-col gap-2'>
      <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]'>
        {t('preview.kanban_card_description')}
      </h4>
      <textarea
        value={content ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('preview.kanban_card_description_placeholder')}
        rows={4}
        className='w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none resize-y focus:border-[var(--accent)]'
      />
    </div>
  )
}

export function DetailPropertiesGrid({
  columns,
  properties,
  onChangeProperty,
}: {
  columns: KanbanProperty[]
  properties: Record<string, unknown>
  onChangeProperty: (id: string, val: unknown) => void
}) {
  const handledIds = new Set(['title', 'status', 'priority', 'tags', 'dueDate', 'startDate', 'endDate', 'files'])
  const remaining = columns.filter((c) => !handledIds.has(c.id) && c.type !== 'files')
  if (remaining.length === 0) return null

  return (
    <div className='grid grid-cols-2 gap-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3.5'>
      {remaining.map((col) => (
        <DetailPropertyField
          key={col.id}
          column={col}
          value={properties[col.id]}
          onChange={(val) => onChangeProperty(col.id, val)}
        />
      ))}
    </div>
  )
}

export function DetailAttachmentsAndSubtasks({
  item,
  onUpdate,
  onConvertSubtask,
}: {
  item: KanbanItem
  onUpdate: (updated: KanbanItem) => void
  onConvertSubtask: (subtaskId: string) => void
}) {
  return (
    <>
      <div className='flex flex-col gap-2'>
        <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]'>
          {t('preview.kanban_files')}
        </h4>
        <KanbanFilesCell
          files={item.files}
          onChangeFiles={(files) => onUpdate({ ...item, files })}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]'>
          {t('preview.kanban_subtasks')}
        </h4>
        <KanbanSubtaskList
          subtasks={item.subtasks ?? []}
          onUpdateSubtasks={(subtasks) => onUpdate({ ...item, subtasks })}
          onConvertToItem={(subtask) => onConvertSubtask(subtask.id)}
        />
      </div>
    </>
  )
}

export function DetailDatesGrid({
  startDateVal,
  dueDateVal,
  onPropertyChange,
}: {
  startDateVal: unknown
  dueDateVal: unknown
  onPropertyChange: (propertyId: string, value: unknown) => void
}) {
  return (
    <div className='grid grid-cols-2 gap-4'>
      <div className='flex flex-col gap-1.5'>
        <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_prop_start_date')}
        </label>
        <KanbanDatePicker
          value={String(startDateVal ?? '')}
          onChange={(val) => onPropertyChange('startDate', val)}
        />
      </div>
      <div className='flex flex-col gap-1.5'>
        <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_prop_end_date')}
        </label>
        <KanbanDatePicker
          value={String(dueDateVal ?? '')}
          onChange={(val) => onPropertyChange('dueDate', val)}
        />
      </div>
    </div>
  )
}
