import { Check, Edit2, ExternalLink, GripVertical, Pin, Star, Trash2, X } from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { Badge, IconButton } from '../../../components/primitives'
import { Checkbox } from '../../../components/form'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { LinkDynamicIcon } from './link-dynamic-icon'

export interface LinkCardRowProps {
  link: BlogLink
  categories: BlogLinkCategory[]
  isSelected: boolean
  onToggleSelect: () => void
  onApprove?: () => void
  onReject?: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  onToggleFavorite: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export function LinkCardRow({
  link,
  categories,
  isSelected,
  onToggleSelect,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleFavorite,
  onContextMenu,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LinkCardRowProps) {
  const categoryLabel = getCategoryLabel(link.categoryId, categories)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault()
          onContextMenu(e)
        }
      }}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]',
        isSelected && 'border-[var(--accent)] bg-[var(--accent-subtle)]/20',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className='flex items-center gap-2 min-w-0 flex-1'>
        {draggable && (
          <span className='cursor-grab text-[var(--text-quaternary)] hover:text-[var(--text-primary)] shrink-0'>
            <GripVertical size={14} />
          </span>
        )}
        <LinkRowInfo
          link={link}
          categoryLabel={categoryLabel}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
        />
      </div>
      <LinkRowActions
        link={link}
        onApprove={onApprove}
        onReject={onReject}
        onEdit={onEdit}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}

function LinkRowHeader({
  name,
  isPinned,
  isFavorite,
  status,
  categoryLabel,
}: {
  name: string
  isPinned?: boolean
  isFavorite?: boolean
  status: BlogLink['status']
  categoryLabel?: string | null
}) {
  return (
    <div className='flex items-center gap-2 flex-wrap'>
      <span className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] truncate max-w-50'>
        {name}
      </span>
      {isPinned && (
        <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[length:var(--text-10)] font-medium bg-[var(--accent-subtle)] text-[var(--accent)]'>
          <Pin size={10} />
          {t('blog.link_pin')}
        </span>
      )}
      {isFavorite && (
        <span className='inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[length:var(--text-10)] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400'>
          <Star size={10} className='fill-current' />
          {t('blog.link_favorite')}
        </span>
      )}
      <StatusBadge status={status} />
      {categoryLabel && (
        <span className='rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {categoryLabel}
        </span>
      )}
    </div>
  )
}

function LinkRowInfo({
  link,
  categoryLabel,
  isSelected,
  onToggleSelect,
}: {
  link: BlogLink
  categoryLabel?: string | null
  isSelected: boolean
  onToggleSelect: () => void
}) {
  return (
    <div className='flex items-center gap-3 min-w-0 flex-1'>
      <Checkbox
        checked={isSelected}
        onChange={onToggleSelect}
        aria-label={link.name}
        className='shrink-0 min-h-0'
      />
      <div className='size-8 flex items-center justify-center rounded-[var(--r-md)] bg-[var(--bg-sunken)] border border-[var(--border-subtle)] shrink-0 overflow-hidden'>
        <LinkDynamicIcon icon={link.avatar} name={link.name} url={link.url} size={18} />
      </div>
      <div className='min-w-0 flex-1 space-y-1'>
        <LinkRowHeader
          name={link.name}
          isPinned={link.isPinned}
          isFavorite={link.isFavorite}
          status={link.status}
          categoryLabel={categoryLabel}
        />
        <div className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-tertiary)] truncate'>
          <a
            href={link.url}
            target='_blank'
            rel='noopener noreferrer'
            className='hover:underline hover:text-[var(--accent)] flex items-center gap-1 truncate max-w-70'
            onClick={(e) => e.stopPropagation()}
          >
            <span className='truncate'>{link.url}</span>
            <ExternalLink size={11} className='shrink-0' />
          </a>
          {link.description && (
            <>
              <span>•</span>
              <span className='truncate text-[var(--text-secondary)]'>{link.description}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LinkRowActions({
  link,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleFavorite,
}: {
  link: BlogLink
  onApprove?: () => void
  onReject?: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div className='flex items-center gap-1 shrink-0'>
      {link.status === 'pending' && (
        <>
          <IconButton label={t('blog.link_approve')} size='sm' onClick={onApprove} className='text-[var(--success)]'>
            <Check size={14} />
          </IconButton>
          <IconButton label={t('blog.link_reject')} size='sm' onClick={onReject} className='text-[var(--danger)]'>
            <X size={14} />
          </IconButton>
        </>
      )}

      <IconButton
        label={link.isFavorite ? t('blog.link_unfavorite') : t('blog.link_favorite')}
        size='sm'
        onClick={onToggleFavorite}
        className={link.isFavorite ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-quaternary)] hover:text-amber-500'}
      >
        <Star size={14} className={link.isFavorite ? 'fill-current' : ''} />
      </IconButton>

      <IconButton
        label={link.isPinned ? t('blog.link_unpin') : t('blog.link_pin')}
        size='sm'
        onClick={onTogglePin}
        className={link.isPinned ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)] hover:text-[var(--accent)]'}
      >
        <Pin size={14} />
      </IconButton>

      <IconButton label={t('blog.edit_link')} size='sm' onClick={onEdit}>
        <Edit2 size={14} />
      </IconButton>

      <IconButton label={t('blog.delete_link')} size='sm' onClick={onDelete} className='hover:text-[var(--danger)]'>
        <Trash2 size={14} />
      </IconButton>
    </div>
  )
}

function StatusBadge({ status }: { status: BlogLink['status'] }) {
  if (status === 'approved') {
    return <Badge tone='success'>{t('blog.link_status_approved')}</Badge>
  }
  if (status === 'rejected') {
    return <Badge tone='danger'>{t('blog.link_status_rejected')}</Badge>
  }
  return <Badge tone='warning'>{t('blog.link_status_pending')}</Badge>
}

function getCategoryLabel(categoryId: string | null | undefined, categories: BlogLinkCategory[]): string | null {
  if (!categoryId) return null
  const current = categories.find((c) => c.id === categoryId)
  if (!current) return null
  if (!current.parentId) return current.name
  const parent = categories.find((c) => c.id === current.parentId)
  if (parent) return `${parent.name} / ${current.name}`
  return current.name
}
