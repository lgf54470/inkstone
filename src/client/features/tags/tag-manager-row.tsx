import { useState } from 'react'
import { Check, ExternalLink, GitMerge, Hash, Pencil, Pin, Trash2, X } from 'lucide-react'
import type { Tag } from '@shared/types'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import { Modal, Tooltip } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { TagManagerController } from './tag-manager-controller'

const MERGE_MODAL_WIDTH = 440

export function TagManagerRow({ tag, controller }: { tag: Tag; controller: TagManagerController }) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [colorOpen, setColorOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const startRename = (): void => {
    setRenaming(true)
    setRenameValue(tag.name)
  }
  const commitRename = (): void => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== tag.name) controller.rename(tag, trimmed)
    setRenaming(false)
  }
  return (
    <div className='group rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 flex-1 items-center gap-2.5'>
          <TagColorButton tag={tag} open={colorOpen} onToggle={() => setColorOpen((open) => !open)} />
          {renaming ? (
            <TagRenameField value={renameValue} onChange={setRenameValue} onSave={commitRename} onCancel={() => setRenaming(false)} />
          ) : (
            <TagRowTitle tag={tag} countLabel={controller.labels?.count} />
          )}
        </div>
        {!renaming && (
          <TagRowActions
            tag={tag}
            controller={controller}
            onRename={startRename}
            onMerge={() => setMerging(true)}
          />
        )}
      </div>
      {colorOpen && <TagColorPalette tag={tag} onPick={(color) => { controller.setColor(tag, color); setColorOpen(false) }} />}
      {merging && <MergeTagsModal source={tag} controller={controller} onClose={() => setMerging(false)} />}
    </div>
  )
}

function TagColorButton({ tag, open, onToggle }: { tag: Tag; open: boolean; onToggle: () => void }) {
  const color = tag.color ?? null
  return (
    <Tooltip label={t('tags.color')}>
      <button
        type='button'
        onClick={onToggle}
        aria-label={t('tags.color')}
        aria-expanded={open}
        className='flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-transform hover:scale-105'
      >
        <Hash size={14} className={color ? 'drop-shadow-[var(--drop-shadow-sm)]' : ''} style={{ color: color ?? 'var(--text-quaternary)' }} />
      </button>
    </Tooltip>
  )
}

function TagRenameField({ value, onChange, onSave, onCancel }: {
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
        aria-label={t('tags.rename')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave()
          if (event.key === 'Escape') onCancel()
        }}
        className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12\.5)] outline-none"
      />
      <Tooltip label={t('common.save')}>
        <IconButton label={t('common.save')} size='sm' onClick={onSave}><Check size={13} className='text-[var(--accent)]' /></IconButton>
      </Tooltip>
      <Tooltip label={t('common.cancel')}>
        <IconButton label={t('common.cancel')} size='sm' onClick={onCancel}><X size={13} /></IconButton>
      </Tooltip>
    </div>
  )
}

function TagRowTitle({ tag, countLabel }: { tag: Tag; countLabel?: (count: number) => string }) {
  return (
    <div className='min-w-0 flex-1'>
      <div className='flex items-center gap-2'>
        <span className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>#{tag.name}</span>
        {tag.isPinned && (
          <span className='inline-flex items-center gap-0.5 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--text-10)] font-medium text-[var(--accent)]'>
            <Pin size={10} className='fill-current' />{t('tags.pinned')}
          </span>
        )}
        <span className='shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {(countLabel ?? ((count: number) => t('tags.notes_count', { value0: count })))(tag.count)}
        </span>
      </div>
    </div>
  )
}

function TagRowActions({ tag, controller, onRename, onMerge }: {
  tag: Tag
  controller: TagManagerController
  onRename: () => void
  onMerge: () => void
}) {
  const isPinned = Boolean(tag.isPinned)
  return (
    <div className='flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100'>
      <Tooltip label={isPinned ? t('tags.unpin') : t('tags.pin')}>
        <IconButton label={isPinned ? t('tags.unpin') : t('tags.pin')} size='sm' onClick={() => controller.togglePin(tag)}>
          <Pin size={13} className={isPinned ? 'fill-current text-[var(--accent)]' : ''} />
        </IconButton>
      </Tooltip>
      {controller.merge && (
        <Tooltip label={t('tags.merge_into')}>
          <IconButton label={t('tags.merge_into')} size='sm' onClick={onMerge}><GitMerge size={13} /></IconButton>
        </Tooltip>
      )}
      {controller.openTag && (
        <Tooltip label={t('tags.open_tag')}>
          <IconButton label={t('tags.open_tag')} size='sm' onClick={() => controller.openTag?.(tag.name)}><ExternalLink size={13} /></IconButton>
        </Tooltip>
      )}
      <Tooltip label={t('tags.rename')}>
        <IconButton label={t('tags.rename')} size='sm' onClick={onRename}><Pencil size={13} /></IconButton>
      </Tooltip>
      <Tooltip label={t('tags.delete')} side='left'>
        <IconButton
          label={t('tags.delete')}
          size='sm'
          className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
          onClick={() => controller.remove(tag)}
        >
          <Trash2 size={13} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function TagColorPalette({ tag, onPick }: { tag: Tag; onPick: (color: string | null) => void }) {
  return (
    <div className='mt-2.5 flex flex-wrap items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2'>
      <Tooltip label={t('tags.clear_color')}>
        <button
          type='button'
          aria-label={t('tags.clear_color')}
          aria-pressed={!tag.color}
          onClick={() => onPick(null)}
          className={cn(
            'flex size-6 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
            !tag.color ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]' : 'border-[var(--border-default)]',
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
            aria-pressed={color === tag.color}
            onClick={() => onPick(color)}
            className={cn(
              'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
              color === tag.color && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]',
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

function MergeTagsModal({ source, controller, onClose }: {
  source: Tag
  controller: TagManagerController
  onClose: () => void
}) {
  const targets = controller.tags.filter((tag) => tag.id !== source.id)
  const countLabel = controller.labels?.count
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tags.merge_into')}
      description={t('tags.merge_choose_target_desc', { value0: source.name })}
      width={MERGE_MODAL_WIDTH}
    >
      <div className='space-y-3 pt-1'>
        <div className='max-h-80 space-y-1 divide-y divide-[var(--border-subtle)]/50 overflow-y-auto'>
          {targets.map((target) => (
            <button
              key={target.id}
              type='button'
              onClick={() => { onClose(); controller.merge?.(source, target) }}
              className='flex w-full items-center justify-between rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]'
            >
              <div className='flex items-center gap-2'>
                <Hash size={13} style={{ color: target.color ?? 'var(--text-quaternary)' }} />
                <span className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>#{target.name}</span>
              </div>
              <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
                {(countLabel ?? ((count: number) => t('tags.notes_count', { value0: count })))(target.count)}
              </span>
            </button>
          ))}
          {targets.length === 0 && (
            <div className='py-8 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('tags.no_other_tags_to_merge')}</div>
          )}
        </div>
        <div className='flex justify-end border-t border-[var(--border-subtle)] pt-2'>
          <Button size='sm' onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  )
}
