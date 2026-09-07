import type { ReactNode } from 'react'
import type { BlogPost } from '@shared/types'
import { BarChart2, Check, Copy, ExternalLink, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import { cn } from '../../lib/cn'
import { useBlogNoteSubmenu } from './use-blog-note-submenu'

export function BlogNoteSubmenu({
  noteId,
  post,
  closeMenu,
  onOpenSettings,
  onOpenStats,
}: {
  noteId: string
  post: BlogPost
  closeMenu: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
}) {
  const bundle = useBlogNoteSubmenu({ noteId, post, closeMenu })

  return (
    <div
      className="w-55 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none space-y-0.5 text-[length:var(--text-12\.5)]"
      onClick={(e) => e.stopPropagation()}
    >
      <SubmenuButton icon={<ExternalLink size={13} className='shrink-0 text-[var(--accent)]' />} label={t('blog.view_in_blog')} onClick={bundle.handleOpenBlog} busy={bundle.isBusy} />
      <SubmenuButton
        icon={bundle.isCopied ? <Check size={13} className='shrink-0 text-[var(--success)]' /> : <Copy size={13} className='shrink-0 text-[var(--text-tertiary)]' />}
        label={t('blog.copy_link')} onClick={() => void bundle.handleCopyLink()} busy={bundle.isBusy}
      />
      <SubmenuButton icon={<BarChart2 size={13} className='shrink-0 text-[var(--text-tertiary)]' />} label={t('blog.comments_and_stats')} onClick={openStatsFrom(closeMenu, onOpenStats)} busy={bundle.isBusy} />
      <SubmenuButton icon={<Settings2 size={13} className='shrink-0 text-[var(--text-tertiary)]' />} label={t('blog.post_settings')} onClick={openSettingsFrom(closeMenu, onOpenSettings)} busy={bundle.isBusy} />
      <SubmenuButton icon={<RefreshCw size={13} className='shrink-0 text-[var(--text-tertiary)]' />} label={t('blog.sync_post')} onClick={() => void bundle.handleSync()} busy={bundle.isBusy} />

      <div role='separator' className='my-1 h-px bg-[var(--border-subtle)]' />

      <SubmenuButton icon={<Trash2 size={13} className='shrink-0 text-[var(--danger)]' />} label={t('blog.unpublish')} onClick={() => void bundle.handleUnpublish()} busy={bundle.isBusy} danger />
    </div>
  )
}

function openStatsFrom(closeMenu: () => void, onOpenStats: () => void): () => void {
  return () => {
    closeMenu()
    onOpenStats()
  }
}

function openSettingsFrom(closeMenu: () => void, onOpenSettings: () => void): () => void {
  return () => {
    closeMenu()
    onOpenSettings()
  }
}

function SubmenuButton({
  icon,
  label,
  onClick,
  busy,
  danger,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  busy?: boolean
  danger?: boolean
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex h-7.5 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left transition-colors',
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      )}
    >
      {icon}
      <span className='min-w-0 flex-1 truncate'>{label}</span>
    </button>
  )
}