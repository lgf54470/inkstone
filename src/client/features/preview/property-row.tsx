import { Calendar, Check, Hash, List, Plus, Trash2, Type, X } from 'lucide-react'
import { TagPill } from '../../components/tag-pill'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { getTagsList, isTagKey, type NotePropertiesBundle } from './use-note-properties'

function PropertyIcon({ rowKey, value }: { rowKey: string; value: unknown }) {
  if (isTagKey(rowKey)) return <Hash size={13} className='shrink-0 text-[var(--accent)]' />
  if (typeof value === 'boolean') return <Check size={13} className='shrink-0 text-[var(--text-tertiary)]' />
  if (Array.isArray(value)) return <List size={13} className='shrink-0 text-[var(--text-tertiary)]' />
  if (rowKey.includes('date') || rowKey.includes('time') || rowKey === 'created' || rowKey === 'updated') {
    return <Calendar size={13} className='shrink-0 text-[var(--text-tertiary)]' />
  }
  return <Type size={13} className='shrink-0 text-[var(--text-tertiary)]' />
}

function TagsValueEditor({ bundle, tagsList }: { bundle: NotePropertiesBundle; tagsList: string[] }) {
  const { tagColors, isAddingTag, setIsAddingTag, newTagText, setNewTagText, handleAddTag, handleRemoveTag } = bundle
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {tagsList.map((tag) => (
        <TagPill
          key={tag}
          tag={tag}
          color={tagColors.get(tag)}
          size='md'
          removable
          onClick={() => useUi.getState().openView('tag', { tag })}
          onRemove={() => handleRemoveTag(tag)}
        />
      ))}
      {isAddingTag ? (
        <input
          autoFocus
          value={newTagText}
          onChange={(e) => setNewTagText(e.target.value)}
          onBlur={() => handleAddTag(newTagText)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddTag(newTagText)
            if (e.key === 'Escape') setIsAddingTag(false)
          }}
          placeholder={t('tags.new_placeholder')}
          className='h-6 w-24 rounded-full bg-[var(--surface-primary)] px-2.5 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]'
        />
      ) : (
        <button
          type='button'
          onClick={() => {
            setIsAddingTag(true)
            setNewTagText('')
          }}
          className='inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--border-default)] px-2 text-[length:var(--text-11)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]'
        >
          <Plus size={11} />
          {t('properties.add_tag')}
        </button>
      )}
    </div>
  )
}

function BooleanValueEditor({ bundle, rowKey, value }: { bundle: NotePropertiesBundle; rowKey: string; value: boolean }) {
  const { handleUpdate } = bundle
  return (
    <button
      type='button'
      onClick={() => handleUpdate(rowKey, !value)}
      className={cn(
        'inline-flex h-5 w-9 items-center rounded-full transition-colors p-0.5',
        value ? 'bg-[var(--accent)]' : 'bg-[var(--surface-tertiary)]',
      )}
    >
      <span className={cn('size-4 rounded-full bg-white transition-transform', value ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  )
}

function ArrayValueEditor({ bundle, rowKey, value }: { bundle: NotePropertiesBundle; rowKey: string; value: unknown[] }) {
  const { handleUpdate } = bundle
  return (
    <div className='flex flex-wrap items-center gap-1'>
      {value.map((item, idx) => (
        <span key={idx} className='inline-flex items-center gap-1 rounded bg-[var(--surface-tertiary)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-primary)]'>
          {String(item)}
          <button type='button' onClick={() => handleUpdate(rowKey, value.filter((_, i) => i !== idx))} className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'>
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  )
}

function TextValueEditor({ bundle, rowKey, value }: { bundle: NotePropertiesBundle; rowKey: string; value: unknown }) {
  const { handleUpdate } = bundle
  return (
    <input
      defaultValue={value == null ? '' : String(value)}
      onBlur={(e) => {
        const val = e.target.value.trim()
        if (val !== String(value ?? '')) handleUpdate(rowKey, val)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur()
        }
      }}
      className='w-full rounded bg-transparent px-1.5 py-0.5 text-[length:var(--text-12)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-primary)] focus:bg-[var(--surface-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
    />
  )
}

function PropertyKeyCell({ bundle, rowKey, value }: { bundle: NotePropertiesBundle; rowKey: string; value: unknown }) {
  const { editingKey, renamedKey, setRenamedKey, setEditingKey, handleRename } = bundle
  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <PropertyIcon rowKey={rowKey} value={value} />
      {editingKey === rowKey ? (
        <input
          autoFocus
          value={renamedKey}
          onChange={(e) => setRenamedKey(e.target.value)}
          onBlur={() => handleRename(rowKey, renamedKey)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename(rowKey, renamedKey)
            if (e.key === 'Escape') setEditingKey(null)
          }}
          className="w-full rounded bg-[var(--surface-primary)] px-1.5 py-0.5 text-[length:var(--text-11\.5)] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
        />
      ) : (
        <span
          title={rowKey}
          onClick={() => {
            setEditingKey(rowKey)
            setRenamedKey(rowKey)
          }}
          className='cursor-pointer truncate font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        >
          {rowKey}
        </span>
      )}
    </div>
  )
}

export function PropertyRow({ bundle, rowKey, value }: { bundle: NotePropertiesBundle; rowKey: string; value: unknown }) {
  const { handleDelete } = bundle
  const isTags = isTagKey(rowKey)
  const tagsList = isTags ? getTagsList(value) : []

  return (
    <div className='group/row grid grid-cols-[140px_1fr_28px] items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--surface-hover)]/30'>
      <PropertyKeyCell bundle={bundle} rowKey={rowKey} value={value} />

      <div className='min-w-0'>
        {isTags ? (
          <TagsValueEditor bundle={bundle} tagsList={tagsList} />
        ) : typeof value === 'boolean' ? (
          <BooleanValueEditor bundle={bundle} rowKey={rowKey} value={value} />
        ) : Array.isArray(value) ? (
          <ArrayValueEditor bundle={bundle} rowKey={rowKey} value={value} />
        ) : (
          <TextValueEditor bundle={bundle} rowKey={rowKey} value={value} />
        )}
      </div>

      <div className='flex justify-end'>
        <Tooltip label={t('properties.delete_property')} side='left'>
          <button
            type='button'
            aria-label={t('properties.delete_property')}
            onClick={() => handleDelete(rowKey)}
            className='rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--danger-softer)] hover:text-[var(--danger)] group-hover/row:opacity-100'
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}