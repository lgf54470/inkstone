import { memo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanItem, KanbanProperty, KanbanSubtask } from '../types'

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
  onChangeTitle,
}: {
  icon?: string
  title: string
  onChangeTitle: (t: string) => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <span>{icon || '📝'}</span>
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

function SubtaskRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: KanbanSubtask
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-2 p-2'>
      <label className='flex items-center gap-2 text-[length:var(--text-13)]'>
        <input
          type='checkbox'
          checked={subtask.completed}
          onChange={onToggle}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
        />
        <span className={subtask.completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}>
          {subtask.title}
        </span>
      </label>
      <button
        type='button'
        onClick={onDelete}
        className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
        aria-label={t('preview.kanban_delete_rule')}
      >
        <X size={13} />
      </button>
    </div>
  )
}

function SubtaskAddInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [newTitle, setNewTitle] = useState('')
  const handleAdd = () => {
    if (!newTitle.trim()) return
    onAdd(newTitle.trim())
    setNewTitle('')
  }
  return (
    <div className='flex items-center gap-2 p-2'>
      <input
        type='text'
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd()
        }}
        placeholder={t('preview.kanban_add_subtask')}
        className='flex-1 border-0 bg-transparent text-[length:var(--text-12)] outline-none'
      />
      <button
        type='button'
        onClick={handleAdd}
        className='inline-flex size-6 items-center justify-center rounded-[var(--r-xs)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_add_subtask')}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

function DetailSubtasks({
  subtasks,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: {
  subtasks: KanbanSubtask[]
  onAddSubtask: (title: string) => void
  onToggleSubtask: (id: string) => void
  onDeleteSubtask: (id: string) => void
}) {
  const completedCount = subtasks.filter((s) => s.completed).length

  return (
    <div className='flex flex-col gap-2'>
      <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]'>
        {t('preview.kanban_subtasks')} ({completedCount}/{subtasks.length})
      </h4>
      <div className='divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        {subtasks.map((subtask) => (
          <SubtaskRow
            key={subtask.id}
            subtask={subtask}
            onToggle={() => onToggleSubtask(subtask.id)}
            onDelete={() => onDeleteSubtask(subtask.id)}
          />
        ))}
        <SubtaskAddInput onAdd={onAddSubtask} />
      </div>
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

function useDetailHandlers(item: KanbanItem, onUpdate: (updated: KanbanItem) => void) {
  const handlePropertyChange = (propertyId: string, value: unknown) => {
    onUpdate({ ...item, properties: { ...item.properties, [propertyId]: value } })
  }
  const handleContentChange = (content: string) => {
    onUpdate({ ...item, content })
  }
  const handleAddSubtask = (title: string) => {
    const subtask: KanbanSubtask = { id: `subtask-${Date.now()}`, title, completed: false }
    onUpdate({ ...item, subtasks: [...(item.subtasks ?? []), subtask] })
  }
  const handleToggleSubtask = (id: string) => {
    const next = (item.subtasks ?? []).map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    onUpdate({ ...item, subtasks: next })
  }
  const handleDeleteSubtask = (id: string) => {
    const next = (item.subtasks ?? []).filter((s) => s.id !== id)
    onUpdate({ ...item, subtasks: next })
  }
  return { handlePropertyChange, handleContentChange, handleAddSubtask, handleToggleSubtask, handleDeleteSubtask }
}

export const KanbanItemDetail = memo(function KanbanItemDetail({
  item,
  columns,
  onClose,
  onUpdate,
  onDelete,
}: KanbanItemDetailProps) {
  if (!item) return null

  const { handlePropertyChange, handleContentChange, handleAddSubtask, handleToggleSubtask, handleDeleteSubtask } =
    useDetailHandlers(item, onUpdate)

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      width={DETAIL_MODAL_WIDTH}
      title={<DetailHeader icon={item.icon} title={item.title} onChangeTitle={(title) => onUpdate({ ...item, title })} />}
      footer={<DetailFooter onDelete={() => { onDelete(item.id); onClose() }} onClose={onClose} />}
    >
      <div className='flex flex-col gap-6 py-2'>
        <div className='grid grid-cols-2 gap-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-3.5'>
          {columns.filter((c) => c.id !== 'title').map((col) => (
            <DetailPropertyField
              key={col.id}
              column={col}
              value={item.properties[col.id]}
              onChange={(val) => handlePropertyChange(col.id, val)}
            />
          ))}
        </div>
        <DetailDescription
          content={item.content}
          onChange={handleContentChange}
        />
        <DetailSubtasks
          subtasks={item.subtasks ?? []}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
        />
      </div>
    </Modal>
  )
})
