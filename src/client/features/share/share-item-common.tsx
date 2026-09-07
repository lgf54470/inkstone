import { Check, Copy, ExternalLink, FolderClosed, FolderInput, Pin, Star, BarChart2, PauseCircle, PlayCircle, QrCode, Settings2, Trash2 } from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { MenuItem } from '../../components/overlay'

export interface ShareItemCallbacks {
  onCopyLink: (url: string, slug: string) => void
  onOpenQr: () => void
  onOpenAnalytics: () => void
  onOpenEdit: () => void
  onMoveToFolder: (folderId: string | null) => void
  onToggleShare: (checked: boolean) => void
  onToggleStar: () => void
  onTogglePin: () => void
  onRevoke: () => void
}

export function buildFolderMenuItems(share: ShareInfo, folders: ShareFolder[], onMoveToFolder: (folderId: string | null) => void): MenuItem[] {
  return [
    {
      id: 'root',
      label: t('share.no_folder'),
      icon: <FolderClosed size={13} className='text-[var(--text-quaternary)]' />,
      checked: !share.shareFolderId,
      onSelect: () => onMoveToFolder(null),
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className='shrink-0'>
          <FolderClosed size={13} />
        </span>
      ),
      checked: share.shareFolderId === f.id,
      onSelect: () => onMoveToFolder(f.id),
    })),
  ]
}

export function buildShareMenuItems(share: ShareInfo, folders: ShareFolder[], cbs: ShareItemCallbacks): MenuItem[] {
  return [
    ...(share.slug
      ? [
          { id: 'open_link', label: t('preview.open_in_new_tab'), icon: <ExternalLink size={13} />, onSelect: () => window.open(share.url, '_blank') },
          { id: 'copy_link', label: t('share.copy_link'), icon: <Copy size={13} />, onSelect: () => cbs.onCopyLink(share.url, share.slug!) },
        ]
      : []),
    { id: 'qr', label: t('share.qr_code_title'), icon: <QrCode size={13} />, onSelect: cbs.onOpenQr },
    { id: 'analytics', label: t('share.view_note_analytics'), icon: <BarChart2 size={13} />, onSelect: cbs.onOpenAnalytics },
    { id: 'settings', label: t('share.edit_share_settings'), icon: <Settings2 size={13} />, onSelect: cbs.onOpenEdit },
    {
      id: 'move',
      label: t('share.batch_move_to_folder'),
      icon: <FolderInput size={13} />,
      separatorBefore: true,
      submenu: ({ closeMenu }) => (
        <MoveFolderSubmenu share={share} folders={folders} onSelect={(folderId) => { closeMenu(); cbs.onMoveToFolder(folderId) }} />
      ),
    },
    { id: 'toggle', label: share.isEnabled ? t('share.batch_disable') : t('share.batch_enable'), icon: share.isEnabled ? <PauseCircle size={13} className='text-[var(--warning)]' /> : <PlayCircle size={13} className='text-[var(--success)]' />, onSelect: () => cbs.onToggleShare(!share.isEnabled) },
    { id: 'star', label: share.isStarred ? t('share.unstar_note') : t('share.star_note'), icon: <Star size={13} className={share.isStarred ? 'text-amber-500 fill-amber-500' : ''} />, onSelect: cbs.onToggleStar },
    { id: 'pin', label: share.isPinned ? t('share.unpin_note') : t('share.pin_note'), icon: <Pin size={13} className={share.isPinned ? 'text-[var(--accent)] fill-current' : ''} />, onSelect: cbs.onTogglePin },
    { id: 'revoke', label: t('share.revoke_link'), icon: <Trash2 size={13} />, tone: 'danger', separatorBefore: true, onSelect: cbs.onRevoke },
  ]
}


function MoveFolderSubmenu({ share, folders, onSelect }: { share: ShareInfo; folders: ShareFolder[]; onSelect: (folderId: string | null) => void }) {
  return (
    <div className='py-1 min-w-40'>
      <button
        type='button'
        onClick={() => onSelect(null)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
          !share.shareFolderId && 'text-[var(--accent)] font-semibold',
        )}
      >
        <FolderClosed size={13} className='text-[var(--text-quaternary)]' />
        <span className='flex-1 truncate'>{t('share.no_folder')}</span>
        {!share.shareFolderId && <Check size={12} className='text-[var(--accent)]' />}
      </button>
      {folders.map((f) => (
        <button
          key={f.id}
          type='button'
          onClick={() => onSelect(f.id)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
            share.shareFolderId === f.id && 'text-[var(--accent)] font-semibold',
          )}
        >
          <FolderClosed size={13} style={{ color: f.color ?? undefined }} className='shrink-0' />
          <span className='flex-1 truncate'>{f.name}</span>
          {share.shareFolderId === f.id && <Check size={12} className='text-[var(--accent)]' />}
        </button>
      ))}
    </div>
  )
}

export function PinStarButtons({ share, onTogglePin, onToggleStar, compact }: { share: ShareInfo; onTogglePin: () => void; onToggleStar: () => void; compact?: boolean }) {
  const size = compact ? 'p-0.5 shrink-0' : 'p-1'
  return (
    <>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        className={cn(
          size,
          'rounded transition-colors',
          share.isPinned
            ? compact
              ? 'text-[var(--accent)]'
              : 'text-[var(--accent)] bg-[var(--accent-subtle)]'
            : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-[var(--accent)]',
        )}
        title={share.isPinned ? t('share.unpin_note') : t('share.pin_note')}
      >
        <Pin size={12} className={share.isPinned ? 'fill-current' : ''} />
      </button>
      <button
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar()
        }}
        className={cn(
          size,
          'rounded transition-colors',
          share.isStarred
            ? compact
              ? 'text-amber-500'
              : 'text-amber-500 bg-amber-500/10'
            : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-amber-500',
        )}
        title={share.isStarred ? t('share.unstar_note') : t('share.star_note')}
      >
        <Star size={12} className={share.isStarred ? 'fill-current' : ''} />
      </button>
    </>
  )
}

function CopySlugButton({ share, copiedSlug, onCopy, className }: { share: ShareInfo; copiedSlug: string | null; onCopy: (url: string, slug: string) => void; className?: string }) {
  return (
    <button
      type='button'
      onClick={() => onCopy(share.url, share.slug!)}
      className={cn('text-[var(--text-quaternary)] hover:text-[var(--text-primary)]', className)}
      title={t('common.copy')}
    >
      {copiedSlug === share.slug ? (
        <Check size={12} className='text-[var(--success)]' />
      ) : (
        <Copy size={12} />
      )}
    </button>
  )
}

export function SlugChip({ share, copiedSlug, onCopy, className, grouped }: { share: ShareInfo; copiedSlug: string | null; onCopy: (url: string, slug: string) => void; className?: string; grouped?: boolean }) {
  const isCustom = share.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug)
  if (!share.slug) return null
  return (
    <div className={cn('rounded-[var(--r-md)] border border-[var(--border-subtle)] px-2 py-1 font-mono text-[length:var(--text-11)] text-[var(--text-secondary)]', className)}>
      <span className='truncate'>{`/s/${share.slug}`}</span>
      {grouped ? (
        <div className='flex items-center gap-1'>
          {isCustom && <CustomBadge />}
          <CopySlugButton share={share} copiedSlug={copiedSlug} onCopy={onCopy} />
        </div>
      ) : (
        <>
          {isCustom && <CustomBadge />}
          <CopySlugButton share={share} copiedSlug={copiedSlug} onCopy={onCopy} className='ml-1' />
        </>
      )}
    </div>
  )
}

function CustomBadge() {
  return (
    <span className='rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[length:var(--text-9)] font-semibold text-[var(--accent)]'>
      {'CUSTOM'}
    </span>
  )
}