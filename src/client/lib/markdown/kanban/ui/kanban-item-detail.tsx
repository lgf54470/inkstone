import { memo, useRef, useState } from 'react'
import { Flag, Trash2 } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { getKanbanDotColor, getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanItem, KanbanOption, KanbanProperty } from '../types'
import { KanbanFilesCell } from './kanban-files-cell'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanIconPicker } from './kanban-icon-picker'
import { KanbanSubtaskList } from './kanban-subtask-list'
import { KanbanTagPicker } from './kanban-tag-picker'

interface KanbanItemDetailProps {
  item: KanbanItem | null
  columns: KanbanProperty[]
  onClose: () => void
  onUpdate: (updated: KanbanItem) => void
  onDelete: (id: string) => void
}

const DETAIL_MODAL_WIDTH = 640

function DetailStatusSelector({
  statusCol,
  statusVal,
  onChangeStatus,
}: {
  statusCol?: KanbanProperty
  statusVal?: unknown
  onChangeStatus: (val: string) => void
}) {
  const opt = statusCol?.options?.find((o) => o.id === statusVal || o.label === statusVal)
  const color = opt?.color ?? 'gray'

  return (
    <div className='flex items-center gap-2'>
      <span
        className='size-2.5 rounded-full'
        style={{ backgroundColor: getKanbanDotColor(color) }}
      />
      <select
        value={String(statusVal ?? '')}
        onChange={(e) => onChangeStatus(e.target.value)}
        className='cursor-pointer rounded-[var(--r-xs)] border-none bg-transparent text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)] outline-none hover:text-[var(--text-primary)]'
      >
        {statusCol?.options?.map((o) => (
          <option key={o.id} value={o.id}>
            {formatKanbanOptionLabel(o, 'status')}
          </option>
        ))}
      </select>
    </div>
  )
}

function DetailHeader({
  icon,
  title,
  statusCol,
  statusVal,
  onChangeIcon,
  onChangeTitle,
  onChangeStatus,
}: {
  icon?: string
  title: string
  statusCol?: KanbanProperty
  statusVal?: unknown
  onChangeIcon: (icon: string | null) => void
  onChangeTitle: (t: string) => void
  onChangeStatus: (val: string) => void
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className='flex flex-col gap-2.5'>
      <DetailStatusSelector
        statusCol={statusCol}
        statusVal={statusVal}
        onChangeStatus={onChangeStatus}
      />

      <div className='flex items-center gap-2'>
        <button
          ref={iconBtnRef}
          type='button'
          onClick={() => setIconPickerOpen((o) => !o)}
          className='flex size-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]'
          title={t('preview.kanban_icon_picker')}
        >
          <KanbanIconBadge icon={icon || '📝'} size={20} />
        </button>
        <KanbanIconPicker
          open={iconPickerOpen}
          anchorRef={iconBtnRef}
          onClose={() => setIconPickerOpen(false)}
          onSelectIcon={onChangeIcon}
          currentIcon={icon}
        />
        <input
          type='text'
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          className='w-full rounded-[var(--r-xs)] border-0 bg-transparent text-[length:var(--text-18)] font-bold text-[var(--text-primary)] outline-none focus:bg-[var(--bg-inset)] px-1'
          placeholder={t('preview.kanban_card_title')}
        />
      </div>
    </div>
  )
}

function PriorityChips({
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

function DetailFooter({ onDelete, onClose }: { onDelete: () => void; onClose: () => void }) {
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

function DetailPropertyField({
  column,
  value,
  onChange,
}: {
  column: KanbanProperty
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <div className='flex flex-col gap-1'>
      <label className='text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {formatKanbanPropertyName(column)}
      </label>
      {column.type === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        >
          <option value=''>{t('preview.kanban_not_set')}</option>
          {column.options?.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {formatKanbanOptionLabel(opt, column.id)}
            </option>
          ))}
        </select>
      ) : column.type === 'date' ? (
        <input
          type='date'
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        />
      ) : column.type === 'number' ? (
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

function DetailDescription({
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

function DetailPropertiesGrid({
  columns,
  properties,
  onChangeProperty,
}: {
  columns: KanbanProperty[]
  properties: Record<string, unknown>
  onChangeProperty: (id: string, val: unknown) => void
}) {
  const handledIds = new Set(['title', 'status', 'priority', 'tags', 'dueDate', 'files'])
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

function DetailAttachmentsAndSubtasks({
  item,
  onUpdate,
}: {
  item: KanbanItem
  onUpdate: (updated: KanbanItem) => void
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
        />
      </div>
    </>
  )
}

function DetailModalContent({
  item,
  columns,
  tagVals,
  tagsCol,
  priorityCol,
  dueDateVal,
  onPropertyChange,
  onUpdate,
}: {
  item: KanbanItem
  columns: KanbanProperty[]
  tagVals: string[]
  tagsCol?: KanbanProperty
  priorityCol?: KanbanProperty
  dueDateVal: unknown
  onPropertyChange: (propertyId: string, value: unknown) => void
  onUpdate: (updated: KanbanItem) => void
}) {
  return (
    <div className='flex flex-col gap-5 py-2'>
      <div className='flex flex-col gap-1.5'>
        <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_prop_tags')}
        </label>
        <KanbanTagPicker
          tags={tagVals}
          options={tagsCol?.options}
          onChangeTags={(nextTags) => onPropertyChange('tags', nextTags)}
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <PriorityChips
          priorityCol={priorityCol}
          currentPriority={item.properties.priority}
          onChangePriority={(val) => onPropertyChange('priority', val)}
        />
        <div className='flex flex-col gap-1.5'>
          <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
            {t('preview.kanban_due_date')}
          </label>
          <input
            type='date'
            value={String(dueDateVal)}
            onChange={(e) => onPropertyChange('dueDate', e.target.value)}
            className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
          />
        </div>
      </div>

      <DetailPropertiesGrid
        columns={columns}
        properties={item.properties}
        onChangeProperty={onPropertyChange}
      />

      <DetailDescription
        content={item.content || item.description}
        onChange={(desc) => onUpdate({ ...item, content: desc, description: desc })}
      />

      <DetailAttachmentsAndSubtasks item={item} onUpdate={onUpdate} />
    </div>
  )
}

export const KanbanItemDetail = memo(function KanbanItemDetail({
  item,
  columns,
  onClose,
  onUpdate,
  onDelete,
}: KanbanItemDetailProps) {
  if (!item) return null

  const handlePropertyChange = (propertyId: string, value: unknown) => {
    onUpdate({ ...item, properties: { ...item.properties, [propertyId]: value } })
  }

  const statusCol = columns.find((c) => c.id === 'status')
  const priorityCol = columns.find((c) => c.id === 'priority')
  const tagsCol = columns.find((c) => c.id === 'tags')
  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const dueDateVal = item.properties.dueDate || item.properties.startDate || ''

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      width={DETAIL_MODAL_WIDTH}
      title={
        <DetailHeader
          icon={item.icon}
          title={item.title}
          statusCol={statusCol}
          statusVal={item.properties.status}
          onChangeIcon={(icon) => onUpdate({ ...item, icon: icon ?? undefined })}
          onChangeTitle={(title) => onUpdate({ ...item, title })}
          onChangeStatus={(val) => handlePropertyChange('status', val)}
        />
      }
      footer={<DetailFooter onDelete={() => { onDelete(item.id); onClose() }} onClose={onClose} />}
    >
      <DetailModalContent
        item={item}
        columns={columns}
        tagVals={tagVals}
        tagsCol={tagsCol}
        priorityCol={priorityCol}
        dueDateVal={dueDateVal}
        onPropertyChange={handlePropertyChange}
        onUpdate={onUpdate}
      />
    </Modal>
  )
})
