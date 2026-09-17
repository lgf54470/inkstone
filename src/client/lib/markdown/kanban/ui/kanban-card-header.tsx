import { useRef, useState } from 'react'
import { MoreHorizontal, Plus, X } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanColorName, KanbanOption, KanbanProperty } from '../types'
import { TagCreatePopover } from './kanban-tag-picker'

function CardTagItem({
  tag,
  options,
  isSelected,
  onSelect,
  onRemove,
}: {
  tag: string
  options?: KanbanOption[]
  isSelected?: boolean
  onSelect?: (tag: string) => void
  onRemove?: (tag: string) => void
}) {
  const color = resolveKanbanTagColor(tag, options)
  const opt = options?.find((o) => o.id === tag || o.label === tag)
  const label = opt?.label ?? tag

  return (
    <span
      style={getKanbanTagStyle(color)}
      className={`group/tag inline-flex items-center gap-0.5 rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-semibold transition-all ${
        isSelected ? 'ring-2 ring-[var(--accent)]' : ''
      }`}
    >
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(tag)
        }}
        className='hover:underline'
        title={t('preview.kanban_filter')}
      >
        {formatKanbanOptionLabel(label, 'tags')}
      </button>
      {onRemove && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onRemove(tag)
          }}
          className='ml-0.5 rounded-[var(--r-xs)] p-0.5 opacity-0 transition-opacity group-hover/card:opacity-60 group-hover/tag:!opacity-100 hover:text-[var(--text-primary)]'
          aria-label={t('preview.kanban_remove_tag')}
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}

function computeTagAddition(name: string, color: KanbanColorName, tagVals: string[], options?: KanbanOption[]) {
  const existing = options?.find((o) => o.id === name || o.label === name)
  const tagId = existing ? existing.id : name.toLowerCase().replace(/\s+/g, '_')
  const nextTags = !tagVals.includes(tagId) && !tagVals.includes(name) ? [...tagVals, tagId] : tagVals
  const newOption = !existing || existing.color !== color ? { id: tagId, label: name, color } : undefined
  return { nextTags, newOption }
}

interface CardAddTagButtonProps {
  itemId: string
  tagVals: string[]
  tagsCol?: KanbanProperty
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function CardAddTagButton({ itemId, tagVals, tagsCol, onUpdateTags, onAddColumnOption }: CardAddTagButtonProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  if (!onUpdateTags) return null

  const handleAdd = (name: string, color: KanbanColorName) => {
    const { nextTags, newOption } = computeTagAddition(name, color, tagVals, tagsCol?.options)
    onUpdateTags(itemId, nextTags, newOption)
    if (newOption && onAddColumnOption) onAddColumnOption('tags', newOption)
  }

  return (
    <div className='relative inline-flex items-center'>
      <button
        ref={btnRef}
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((prev) => !prev)
        }}
        className='inline-flex items-center gap-0.5 rounded-[var(--r-xs)] border border-dashed border-[var(--border-default)] px-1 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover/card:opacity-100 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_new_tag')}
        title={t('preview.kanban_new_tag')}
      >
        <Plus size={10} />
        <span>{t('preview.kanban_new_tag')}</span>
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <TagCreatePopover
            options={tagsCol?.options}
            existingTags={tagVals}
            anchorRef={btnRef}
            onClose={() => setOpen(false)}
            onAddTag={handleAdd}
          />
        </div>
      )}
    </div>
  )
}

export interface CardHeaderProps {
  isSelected: boolean
  itemId: string
  tagVals: string[]
  tagsCol?: KanbanProperty
  selectedTags?: string[]
  onToggleSelect: () => void
  onOpenDetail: () => void
  onToggleTag?: (tag: string) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

export function CardHeader({
  isSelected,
  itemId,
  tagVals,
  tagsCol,
  selectedTags,
  onToggleSelect,
  onOpenDetail,
  onToggleTag,
  onUpdateTags,
  onAddColumnOption,
}: CardHeaderProps) {
  const handleRemove = onUpdateTags
    ? (tag: string) => onUpdateTags(itemId, tagVals.filter((t) => t !== tag))
    : undefined

  return (
    <div className='flex items-center justify-between gap-1.5'>
      <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <input
          type='checkbox'
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)] opacity-0 transition-opacity group-hover/card:opacity-100 checked:opacity-100'
          aria-label={t('preview.kanban_select_card')}
        />
        {tagVals.slice(0, 5).map((tag) => (
          <CardTagItem
            key={tag}
            tag={tag}
            options={tagsCol?.options}
            isSelected={selectedTags?.includes(tag)}
            onSelect={onToggleTag}
            onRemove={handleRemove}
          />
        ))}
        <CardAddTagButton
          itemId={itemId}
          tagVals={tagVals}
          tagsCol={tagsCol}
          onUpdateTags={onUpdateTags}
          onAddColumnOption={onAddColumnOption}
        />
      </div>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail()
        }}
        className='opacity-0 transition-opacity group-hover/card:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_card_details')}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}
