import { memo } from 'react'
import { Check, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useNoteProperties, type NotePropertiesBundle } from './use-note-properties'
import { PropertyRow } from './property-row'


interface NotePropertiesEditorProps {
  noteId: string | null
  content: string
  className?: string
}

function EmptyProperties({ onAdd, className }: { onAdd: () => void; className?: string }) {
  return (
    <div className={cn('note-properties-editor mb-4 flex items-center justify-between rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-1.5 text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)]', className)}>
      <span className='flex items-center gap-1.5 font-medium'>
        <SlidersHorizontal size={13} />
        {t('markdown.properties')}
      </span>
      <button
        type='button'
        onClick={onAdd}
        className='inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]'
      >
        <Plus size={12} />
        {t('properties.add_property')}
      </button>
    </div>
  )
}

function PropertiesHeader({ bundle }: { bundle: NotePropertiesBundle }) {
  const { properties, isExpanded, setIsExpanded } = bundle
  return (
    <div className='flex items-center justify-between px-3 py-2 text-[var(--text-secondary)]'>
      <button
        type='button'
        onClick={() => setIsExpanded(!isExpanded)}
        className='flex items-center gap-2 font-medium text-[var(--text-primary)] hover:opacity-80 transition-opacity'
      >
        <SlidersHorizontal size={13} className='text-[var(--text-tertiary)]' />
        <span>{t('markdown.properties')}</span>
        <span className="rounded-full bg-[var(--surface-tertiary)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-normal text-[var(--text-tertiary)]">
          {properties.length}
        </span>
      </button>
      <button
        type='button'
        onClick={() => setIsExpanded(!isExpanded)}
        className='p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors'
      >
        <ChevronDown size={14} className={cn('transition-transform duration-[var(--dur-base)]', !isExpanded && '-rotate-90')} />
      </button>
    </div>
  )
}

function AddPropertyForm({ bundle }: { bundle: NotePropertiesBundle }) {
  const { newKey, setNewKey, newValue, setNewValue, handleCommitNewProperty, setIsAddingProperty } = bundle
  return (
    <div className='flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-tertiary)]/30 px-3 py-2'>
      <input
        autoFocus
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        placeholder={t('properties.property_name')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommitNewProperty()
          if (e.key === 'Escape') setIsAddingProperty(false)
        }}
        className="h-7 w-32 rounded border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 text-[length:var(--text-11\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <input
        value={newValue}
        onChange={(e) => setNewValue(e.target.value)}
        placeholder={t('properties.property_value')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommitNewProperty()
          if (e.key === 'Escape') setIsAddingProperty(false)
        }}
        className="h-7 min-w-35 flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 text-[length:var(--text-11\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <div className='flex items-center gap-1'>
        <button
          type='button'
          onClick={handleCommitNewProperty}
          className="inline-flex h-7 items-center rounded bg-[var(--accent)] px-2.5 text-[length:var(--text-11\.5)] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Check size={12} className='mr-1' />
          {t('overlay.confirm')}
        </button>
        <button
          type='button'
          onClick={() => setIsAddingProperty(false)}
          className="inline-flex h-7 items-center rounded px-2 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

export const NotePropertiesEditor = memo(function NotePropertiesEditor({ noteId, content, className }: NotePropertiesEditorProps) {
  const bundle = useNoteProperties(noteId, content)
  const { properties, isExpanded, isAddingProperty, beginAddProperty } = bundle

  if (!properties.length && !isAddingProperty) {
    return <EmptyProperties onAdd={beginAddProperty} className={className} />
  }

  return (
    <div className={cn('note-properties-editor mb-4 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 text-[length:var(--text-12)]', className)}>
      <PropertiesHeader bundle={bundle} />

      {isExpanded && (
        <div className='border-t border-[var(--border-subtle)]'>
          <div className='divide-y divide-[var(--border-subtle)]/50'>
            {properties.map(([key, value]) => (
              <PropertyRow key={key} bundle={bundle} rowKey={key} value={value} />
            ))}
          </div>

          {isAddingProperty ? (
            <AddPropertyForm bundle={bundle} />
          ) : (
            <div className='border-t border-[var(--border-subtle)] bg-[var(--surface-tertiary)]/20 px-3 py-2'>
              <button
                type='button'
                onClick={beginAddProperty}
                className="inline-flex items-center gap-1.5 text-[length:var(--text-11\.5)] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
              >
                <Plus size={12} />
                {t('properties.add_property')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})