import { useState } from 'react'
import { Check, ExternalLink, GitMerge, Hash, Pencil, Pin, Trash2, X } from 'lucide-react'
import type { Tag } from '@shared/types'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import { Modal, Tooltip } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { useNotes } from '../../store/notes'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { deleteTag, renameTag, setTagColor, toggleTagPinned } from './tag-mutations'

const MERGE_MODAL_WIDTH = 440

export function TagManageRow({
  tag,
  onOpenTag,
}: {
  tag: Tag
  onOpenTag: (name: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [colorOpen, setColorOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const startRename = () => {
    setRenaming(true)
    setRenameValue(tag.name)
  }
  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== tag.name) {
      void renameTag(tag, trimmed)
    }
    setRenaming(false)
  }
  return (
    <div className='group rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 flex-1 items-center gap-2.5'>
          <TagColorButton tag={tag} open={colorOpen} onToggle={() => setColorOpen((open) => !open)} />
          {renaming ? (
            <TagRenameField
              value={renameValue}
              onChange={setRenameValue}
              onSave={commitRename}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <TagRowTitle tag={tag} />
          )}
        </div>
        {!renaming && (
          <TagRowActions
            tag={tag}
            onRename={startRename}
            onOpen={() => onOpenTag(tag.name)}
            onMerge={() => setMerging(true)}
          />
        )}
      </div>
      {colorOpen && <TagColorPalette tag={tag} onClose={() => setColorOpen(false)} />}
      {merging && <MergeTagsModal source={tag} onClose={() => setMerging(false)} />}
    </div>
  )
}

function TagColorButton({
  tag,
  open,
  onToggle,
}: {
  tag: Tag
  open: boolean
  onToggle: () => void
}) {
  const color = tag.color ?? null
  return (
    <Tooltip label={t('tags.color')}>
      <button
        type='button'
        onClick={onToggle}
        aria-label={t('tags.color')}
        aria-expanded={open}
        className='flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-transform hover:scale-105'
        style={{ color: color ?? 'var(--text-quaternary)' }}
      >
        <Hash
          size={14}
          className={color ? 'drop-shadow-[var(--drop-shadow-sm)]' : ''}
          style={{ color: color ?? 'var(--text-quaternary)' }}
        />
      </button>
    </Tooltip>
  )
}

function TagRenameField({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className='flex flex-1 items-center gap-1.5'>
      <input
        autoFocus
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12\\.5)] outline-none"
      />
      <Tooltip label={t('common.save')}>
        <IconButton label={t('common.save')} size='sm' onClick={onSave}>
          <Check size={13} className='text-[var(--accent)]' />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('common.cancel')}>
        <IconButton label={t('common.cancel')} size='sm' onClick={onCancel}>
          <X size={13} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function TagRowTitle({ tag }: { tag: Tag }) {
  const isPinned = Boolean(tag.isPinned)
  return (
    <div className='min-w-0 flex-1'>
      <div className='flex items-center gap-2'>
        <span className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          #{tag.name}
        </span>
        {isPinned && (
          <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[length:var(--text-10)] font-medium bg-[var(--accent-soft)] text-[var(--accent)]'>
            <Pin size={10} className='fill-current' />
            {t('tags.pinned')}
          </span>
        )}
        <span className='shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('tags.notes_count', { value0: tag.count })}
        </span>
      </div>
    </div>
  )
}

function TagRowActions({
  tag,
  onRename,
  onOpen,
  onMerge,
}: {
  tag: Tag
  onRename: () => void
  onOpen: () => void
  onMerge: () => void
}) {
  const isPinned = Boolean(tag.isPinned)
  return (
    <div className='flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100'>
      <Tooltip label={isPinned ? t('tags.unpin') : t('tags.pin')}>
        <IconButton label={isPinned ? t('tags.unpin') : t('tags.pin')} size='sm' onClick={() => void toggleTagPinned(tag)}>
          <Pin size={13} className={isPinned ? 'fill-current text-[var(--accent)]' : ''} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('tags.merge_into')}>
        <IconButton label={t('tags.merge_into')} size='sm' onClick={onMerge}>
          <GitMerge size={13} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('tags.open_tag')}>
        <IconButton label={t('tags.open_tag')} size='sm' onClick={onOpen}>
          <ExternalLink size={13} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('tags.rename')}>
        <IconButton label={t('tags.rename')} size='sm' onClick={onRename}>
          <Pencil size={13} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('tags.delete')} side='left'>
        <IconButton
          label={t('tags.delete')}
          size='sm'
          className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
          onClick={() => void deleteTag(tag)}
        >
          <Trash2 size={13} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function TagColorPalette({ tag, onClose }: { tag: Tag; onClose: () => void }) {
  return (
    <div className='mt-2.5 flex flex-wrap items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2'>
      <Tooltip label={t('tags.clear_color')}>
        <button
          type='button'
          aria-label={t('tags.clear_color')}
          onClick={() => {
            void setTagColor(tag, null)
            onClose()
          }}
          className={cn(
            'flex size-6 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
            !tag.color
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
              : 'border-[var(--border-default)]'
          )}
        >
          <Hash size={12} />
        </button>
      </Tooltip>
      {ORGANIZER_COLORS.map((color) => (
        <Tooltip key={color} label={color}>
          <button
            type='button'
            aria-label={color}
            onClick={() => {
              void setTagColor(tag, color)
              onClose()
            }}
            className={cn(
              'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
              color === tag.color && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
            )}
            style={{ backgroundColor: color }}
          >
            {color === tag.color && <Check size={12} className='text-white drop-shadow-[var(--drop-shadow-sm)]' />}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

function MergeTagsModal({ source, onClose }: { source: Tag; onClose: () => void }) {
  const tags = useNotes((s) => s.tags ?? [])
  const targets = tags.filter((tag) => tag.id !== source.id)
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tags.merge_into')}
      description={t('tags.merge_choose_target_desc', { value0: source.name })}
      width={MERGE_MODAL_WIDTH}
    >
      <div className='space-y-3 pt-1'>
        <div className='max-h-80 overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50'>
          {targets.map((target) => (
            <MergeTargetRow
              key={target.id}
              target={target}
              onPick={() => {
                const src = source
                onClose()
                void renameTag(src, target.name)
              }}
            />
          ))}
          {targets.length === 0 && (
            <div className='py-8 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
              {t('tags.no_other_tags_to_merge')}
            </div>
          )}
        </div>
        <div className='flex justify-end pt-2 border-t border-[var(--border-subtle)]'>
          <Button size='sm' onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MergeTargetRow({ target, onPick }: { target: Tag; onPick: () => void }) {
  return (
    <button
      type='button'
      onClick={onPick}
      className='flex w-full items-center justify-between rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]'
    >
      <div className='flex items-center gap-2'>
        <Hash size={13} style={{ color: target.color ?? 'var(--text-quaternary)' }} />
        <span className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          #{target.name}
        </span>
      </div>
      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {t('tags.notes_count', { value0: target.count })}
      </span>
    </button>
  )
}
