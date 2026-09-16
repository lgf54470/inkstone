import { memo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanItem, KanbanProperty } from '../types'
import { KanbanFilesCell } from './kanban-files-cell'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanIconPicker } from './kanban-icon-picker'
import { KanbanSubtaskList } from './kanban-subtask-list'

interface KanbanItemDetailProps {
  item: KanbanItem | null
  columns: KanbanProperty[]
  onClose: () => void
  onUpdate: (updated: KanbanItem) => void
  onDelete: (id: string) => void
}

const DETAIL_MODAL_WIDTH = 640

function DetailHeader({
  icon,
  title,
  onChangeIcon,
  onChangeTitle,
}: {
  icon?: string
  title: string
  onChangeIcon: (icon: string | null) => void
  onChangeTitle: (t: string) => void
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className='flex items-center gap-2'>
      <button
        ref={iconBtnRef}
        type='button'
        onClick={() => setIconPickerOpen((o) => !o)}
        className='flex size-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] hover:bg-[var(--bg-hover)]'
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
        className='w-full rounded-[var(--r-xs)] border-0 bg-transparent text-[length:var(--text-16)] font-semibold text-[var(--text-primary)] outline-none focus:bg-[var(--bg-inset)] px-1'
        placeholder={t('preview.kanban_card_title')}
      />
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
        placeholder={t('preview.kanban_card_description')}
        rows={4}
        className='w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none resize-y focus:border-[var(--accent)]'
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
  return (
    <div className='grid grid-cols-2 gap-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3.5'>
      {columns
        .filter((c) => c.id !== 'title' && c.type !== 'files')
        .map((col) => (
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

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      width={DETAIL_MODAL_WIDTH}
      title={
        <DetailHeader
          icon={item.icon}
          title={item.title}
          onChangeIcon={(icon) => onUpdate({ ...item, icon: icon ?? undefined })}
          onChangeTitle={(title) => onUpdate({ ...item, title })}
        />
      }
      footer={<DetailFooter onDelete={() => { onDelete(item.id); onClose() }} onClose={onClose} />}
    >
      <div className='flex flex-col gap-6 py-2'>
        <DetailPropertiesGrid
          columns={columns}
          properties={item.properties}
          onChangeProperty={handlePropertyChange}
        />
        <DetailDescription
          content={item.content}
          onChange={(content) => onUpdate({ ...item, content })}
        />
        <DetailAttachmentsAndSubtasks item={item} onUpdate={onUpdate} />
      </div>
    </Modal>
  )
})
