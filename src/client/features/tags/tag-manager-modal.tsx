import { useMemo, useState } from 'react'
import { Hash, Plus, Search, X } from 'lucide-react'
import { Modal, Tooltip } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import type { TagManagerController } from './tag-manager-controller'
import { TagManagerRow } from './tag-manager-row'

const MODAL_WIDTH = 640

export function TagManagerModal({ controller, onClose, title }: {
  controller: TagManagerController
  onClose: () => void
  title?: string
}) {
  return (
    <Modal open onClose={onClose} title={title ?? t('tags.manage_tags')} description={controller.labels?.description ?? t('tags.manage_description')} width={MODAL_WIDTH}>
      <TagManagerPanel controller={controller} />
    </Modal>
  )
}

function TagManagerPanel({ controller }: { controller: TagManagerController }) {
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const unusedTags = useMemo(() => controller.tags.filter((tag) => tag.count === 0), [controller.tags])
  return (
    <div className='space-y-3 pt-1'>
      <div className='flex items-center gap-2'>
        <div className='relative flex-1'>
          <Search size={14} className='pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-quaternary)]' />
          <input
            type='text'
            value={query}
            aria-label={t('notes.tag_filter_search')}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('notes.tag_filter_search')}
            className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pr-3 pl-9 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)]"
          />
        </div>
        {controller.removeUnused && unusedTags.length > 0 && !isCreating && (
          <Tooltip label={t('tags.clean_unused')}>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => controller.removeUnused?.(unusedTags)}
              className='h-8 shrink-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]'
            >
              {t('tags.clean_unused_value0', { value0: unusedTags.length })}
            </Button>
          </Tooltip>
        )}
        {!isCreating && (
          <Tooltip label={t('tags.new')}>
            <Button variant='primary' size='sm' icon={<Plus size={14} className='shrink-0' />} onClick={() => setIsCreating(true)} className='h-8 shrink-0'>
              {t('tags.new')}
            </Button>
          </Tooltip>
        )}
      </div>
      {isCreating && <TagCreateForm controller={controller} onDone={() => setIsCreating(false)} />}
      <TagManagerList controller={controller} query={query} />
    </div>
  )
}

function TagCreateForm({ controller, onDone }: { controller: TagManagerController; onDone: () => void }) {
  const [name, setName] = useState('')
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    controller.create(trimmed)
    setName('')
    onDone()
  }
  return (
    <form onSubmit={submit} className='flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)]/25 p-2'>
      <Hash size={16} className='ml-1 shrink-0 text-[var(--accent)]' />
      <input
        autoFocus
        type='text'
        value={name}
        aria-label={t('tags.new')}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onDone() }}
        placeholder={controller.labels?.createPlaceholder ?? t('tags.new_placeholder')}
        className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <Button variant='primary' size='sm' type='submit' disabled={!name.trim()} className='h-8 shrink-0'>{t('tags.create')}</Button>
      <Tooltip label={t('common.cancel')}>
        <IconButton label={t('common.cancel')} size='sm' type='button' onClick={onDone}><X size={14} /></IconButton>
      </Tooltip>
    </form>
  )
}

function TagManagerList({ controller, query }: { controller: TagManagerController; query: string }) {
  const choices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return controller.tags
      .filter((tag) => !normalized || tag.name.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => {
        const aPinned = Boolean(a.isPinned)
        const bPinned = Boolean(b.isPinned)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        return b.count - a.count || a.name.localeCompare(b.name)
      })
  }, [controller.tags, query])
  return (
    <div className='max-h-105 space-y-1 divide-y divide-[var(--border-subtle)]/50 overflow-y-auto'>
      {choices.map((tag) => <TagManagerRow key={tag.id} tag={tag} controller={controller} />)}
      {choices.length === 0 && (
        <div className="py-10 text-center text-[length:var(--text-12\.5)] text-[var(--text-quaternary)]">{t('tags.no_match')}</div>
      )}
    </div>
  )
}
