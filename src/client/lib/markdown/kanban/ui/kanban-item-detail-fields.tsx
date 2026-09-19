import { useId, useRef, useState } from 'react'
import { ChevronDown, Flag, Trash2 } from 'lucide-react'
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

/** The listbox the status trigger opens; `id` is the target of its `aria-controls`. */
export function StatusOptionList({
  id,
  label,
  options,
  current,
  onSelect,
}: {
  id: string
  label: string
  options: KanbanOption[]
  current?: unknown
  onSelect: (id: string) => void
}) {
  return (
    <div
      id={id}
      role='listbox'
      aria-label={label}
      className='absolute left-0 top-full z-[var(--z-popover)] mt-1 min-w-36 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'
    >
      {options.map((o) => (
        <StatusOptionItem
          key={o.id}
          option={o}
          isSelected={o.id === current || o.label === current}
          onSelect={onSelect}
        />
      ))}
    </div>
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
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
          {formatKanbanPropertyName(column)}
        </span>
        <KanbanDatePicker
          propertyName={formatKanbanPropertyName(column)}
          value={String(value ?? '')}
          onChange={onChange}
        />
      </div>
    )
  }

  return (
    <label className='flex flex-col gap-1'>
      <span className='text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {formatKanbanPropertyName(column)}
      </span>
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
    </label>
  )
}

/**
 * Descriptions are free prose stored inside the note body, so the box bounds how far one can grow
 * instead of letting a single card balloon the fence. Content a board already stores above the bound
 * stays editable: clamping it on the first keystroke would delete what the note already holds.
 */
export const KANBAN_DESCRIPTION_MAX_CHARS = 5000
/** The counter appears for the last stretch, so the bound is seen coming rather than only hit. */
const KANBAN_DESCRIPTION_WARN_CHARS = KANBAN_DESCRIPTION_MAX_CHARS - 500
const DESCRIPTION_ROWS = 4
const EXPANDED_DESCRIPTION_ROWS = 16

/** What the length bound has to say about the draft in progress: the notice only after a rejection. */
function DescriptionFeedback({ count, trimmed }: { count: number; trimmed: boolean }) {
  if (!trimmed && count < KANBAN_DESCRIPTION_WARN_CHARS) return null
  return (
    <>
      {trimmed ? (
        <p role='status' className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          {t('preview.kanban_desc_limit_reached', { limit: KANBAN_DESCRIPTION_MAX_CHARS })}
        </p>
      ) : null}
      {count >= KANBAN_DESCRIPTION_WARN_CHARS ? (
        <p data-kanban-desc-count className='text-[length:var(--text-11)] text-[var(--text-tertiary)] tabular'>
          {t('preview.kanban_desc_count', { count, limit: KANBAN_DESCRIPTION_MAX_CHARS })}
        </p>
      ) : null}
    </>
  )
}

/** The heading plus the control that trades the box's height for a wider view of it. */
function DescriptionHeader({
  boxId,
  expanded,
  onToggle,
}: {
  boxId: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]'>
        {t('preview.kanban_card_description')}
      </h4>
      <button
        type='button'
        aria-expanded={expanded}
        aria-controls={boxId}
        aria-label={t(expanded ? 'preview.kanban_collapse_description' : 'preview.kanban_expand_description')}
        onClick={onToggle}
        className='flex items-center justify-center rounded-[var(--r-xs)] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <ChevronDown size={14} className={expanded ? 'rotate-180' : undefined} />
      </button>
    </div>
  )
}

export function DetailDescription({
  itemId,
  content,
  onChange,
}: {
  itemId: string
  content?: string
  onChange: (text: string) => void
}) {
  const [draft, setDraft] = useState(content ?? '')
  const [trimmed, setTrimmed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const boxId = useId()
  const lastTarget = useRef(itemId)
  const lastSent = useRef(content ?? '')
  if (lastTarget.current !== itemId) {
    lastTarget.current = itemId
    lastSent.current = content ?? ''
    setDraft(content ?? '')
    setTrimmed(false)
    setExpanded(false)
  }
  const commitDraft = () => {
    if (draft === lastSent.current) return
    lastSent.current = draft
    onChange(draft)
  }
  const handleChange = (next: string) => {
    const ceiling = Math.max(KANBAN_DESCRIPTION_MAX_CHARS, draft.length)
    const kept = next.slice(0, ceiling)
    setTrimmed(kept.length < next.length)
    setDraft(kept)
  }

  return (
    <div data-kanban-description className='flex flex-col gap-2'>
      <DescriptionHeader boxId={boxId} expanded={expanded} onToggle={() => setExpanded((prev) => !prev)} />
      <textarea
        id={boxId}
        value={draft}
        data-owns-escape='true'
        onChange={(e) => handleChange(e.target.value)}
        onBlur={commitDraft}
        // Enter commits nothing here: the description is the one multi-line field, so the key must stay a newline.
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(lastSent.current)
            setTrimmed(false)
          }
        }}
        placeholder={t('preview.kanban_card_description_placeholder')}
        rows={expanded ? EXPANDED_DESCRIPTION_ROWS : DESCRIPTION_ROWS}
        className='w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none resize-y focus:border-[var(--accent)]'
      />
      <DescriptionFeedback count={draft.length} trimmed={trimmed} />
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
          propertyName={t('preview.kanban_prop_start_date')}
          value={String(startDateVal ?? '')}
          onChange={(val) => onPropertyChange('startDate', val)}
        />
      </div>
      <div className='flex flex-col gap-1.5'>
        <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_prop_end_date')}
        </label>
        <KanbanDatePicker
          propertyName={t('preview.kanban_prop_end_date')}
          value={String(dueDateVal ?? '')}
          onChange={(val) => onPropertyChange('dueDate', val)}
        />
      </div>
    </div>
  )
}
