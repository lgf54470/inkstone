import { useRef, useState } from 'react'
import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FolderClosed,
  FolderInput,
  Lock,
  PauseCircle,
  Pin,
  PlayCircle,
  QrCode,
  Settings2,
  Share2,
  Star,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { Switch } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { Menu, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useShareStore } from './share-store'

export function ShareGridView({
  shares,
  onOpenQr,
  onOpenAnalytics,
  onOpenEdit,
}: {
  shares: ShareInfo[]
  onOpenQr: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
}) {
  const toast = useUi((s) => s.toast)
  const folders = useShareStore((s) => s.folders)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const toggleSelect = useShareStore((s) => s.toggleSelect)
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)
  const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
  const batchToggle = useShareStore((s) => s.batchToggle)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const handleCopy = async (url: string, slug: string) => {
    try {
      const full = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
      await navigator.clipboard.writeText(full)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), COPY_FEEDBACK_MS)
    } catch (error) {
      console.warn('[share] failed to copy link', error)
    }
  }

  const handleMoveToFolder = async (noteId: string, folderId: string | null) => {
    const ok = await batchMoveToFolder([noteId], folderId)
    if (ok) {
      toast({ title: t('share.batch_move_success', { count: 1 }), tone: 'success' })
    }
  }

  const handleRevoke = async (share: ShareInfo) => {
    const ok = await confirm({
      title: t('share.revoke_this_public_link'),
      description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
      confirmLabel: t('share.revoke_link'),
      tone: 'danger',
    })
    if (!ok) return
    await batchToggle('revoke', [share.noteId])
  }

  if (shares.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <Share2 size={32} className="text-[var(--text-quaternary)]" />
        <p className="text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]">
          {t('share.no_shares_found')}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {shares.map((share) => {
        const isSelected = selectedNoteIds.has(share.noteId)
        return (
          <ShareGridCard
            key={share.noteId}
            share={share}
            isSelected={isSelected}
            folders={folders}
            copiedSlug={copiedSlug}
            onToggleSelect={() => toggleSelect(share.noteId)}
            onTogglePin={() => void togglePin(share.noteId)}
            onToggleStar={() => void toggleStar(share.noteId)}
            onToggleShare={(checked) => void toggleShare(share.noteId, checked)}
            onCopy={handleCopy}
            onOpenQr={() => onOpenQr(share)}
            onOpenAnalytics={() => onOpenAnalytics(share)}
            onOpenEdit={() => onOpenEdit(share)}
            onMoveToFolder={(folderId) => void handleMoveToFolder(share.noteId, folderId)}
            onRevoke={() => void handleRevoke(share)}
          />
        )
      })}
    </div>
  )
}

function ShareGridCard({
  share,
  isSelected,
  folders,
  copiedSlug,
  onToggleSelect,
  onTogglePin,
  onToggleStar,
  onToggleShare,
  onCopy,
  onOpenQr,
  onOpenAnalytics,
  onOpenEdit,
  onMoveToFolder,
  onRevoke,
}: {
  share: ShareInfo
  isSelected: boolean
  folders: ShareFolder[]
  copiedSlug: string | null
  onToggleSelect: () => void
  onTogglePin: () => void
  onToggleStar: () => void
  onToggleShare: (checked: boolean) => void
  onCopy: (url: string, slug: string) => void
  onOpenQr: () => void
  onOpenAnalytics: () => void
  onOpenEdit: () => void
  onMoveToFolder: (folderId: string | null) => void
  onRevoke: () => void
}) {
  const contextMenu = useContextMenu()
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)

  const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
  const isCustom = share.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug)
  const folder = share.shareFolderId ? folders.find((f) => f.id === share.shareFolderId) : null

  const folderMenuItems: MenuItem[] = [
    {
      id: 'root',
      label: t('share.no_folder'),
      icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
      checked: !share.shareFolderId,
      onSelect: () => onMoveToFolder(null),
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className="shrink-0">
          <FolderClosed size={13} />
        </span>
      ),
      checked: share.shareFolderId === f.id,
      onSelect: () => onMoveToFolder(f.id),
    })),
  ]

  const contextMenuItems: MenuItem[] = [
    ...(share.slug
      ? [
          {
            id: 'open_link',
            label: t('preview.open_in_new_tab'),
            icon: <ExternalLink size={13} />,
            onSelect: () => window.open(share.url, '_blank'),
          },
          {
            id: 'copy_link',
            label: t('share.copy_link'),
            icon: <Copy size={13} />,
            onSelect: () => onCopy(share.url, share.slug!),
          },
        ]
      : []),
    {
      id: 'qr',
      label: t('share.qr_code_title'),
      icon: <QrCode size={13} />,
      onSelect: onOpenQr,
    },
    {
      id: 'analytics',
      label: t('share.view_note_analytics'),
      icon: <BarChart2 size={13} />,
      onSelect: onOpenAnalytics,
    },
    {
      id: 'settings',
      label: t('share.edit_share_settings'),
      icon: <Settings2 size={13} />,
      onSelect: onOpenEdit,
    },
    {
      id: 'move',
      label: t('share.batch_move_to_folder'),
      icon: <FolderInput size={13} />,
      separatorBefore: true,
      submenu: ({ closeMenu }) => (
        <div className="py-1 min-w-[160px]">
          <button
            type="button"
            onClick={() => {
              closeMenu()
              onMoveToFolder(null)
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
              !share.shareFolderId && 'text-[var(--accent)] font-semibold',
            )}
          >
            <FolderClosed size={13} className="text-[var(--text-quaternary)]" />
            <span className="flex-1 truncate">{t('share.no_folder')}</span>
            {!share.shareFolderId && <Check size={12} className="text-[var(--accent)]" />}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                closeMenu()
                onMoveToFolder(f.id)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
                share.shareFolderId === f.id && 'text-[var(--accent)] font-semibold',
              )}
            >
              <FolderClosed size={13} style={{ color: f.color ?? undefined }} className="shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {share.shareFolderId === f.id && <Check size={12} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'toggle',
      label: share.isEnabled ? t('share.batch_disable') : t('share.batch_enable'),
      icon: share.isEnabled ? (
        <PauseCircle size={13} className="text-[var(--warning)]" />
      ) : (
        <PlayCircle size={13} className="text-[var(--success)]" />
      ),
      onSelect: () => onToggleShare(!share.isEnabled),
    },
    {
      id: 'star',
      label: share.isStarred ? t('share.unstar_note') : t('share.star_note'),
      icon: <Star size={13} className={share.isStarred ? 'text-amber-500 fill-amber-500' : ''} />,
      onSelect: onToggleStar,
    },
    {
      id: 'pin',
      label: share.isPinned ? t('share.unpin_note') : t('share.pin_note'),
      icon: <Pin size={13} className={share.isPinned ? 'text-[var(--accent)] fill-current' : ''} />,
      onSelect: onTogglePin,
    },
    {
      id: 'revoke',
      label: t('share.revoke_link'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: onRevoke,
    },
  ]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/inkstone-share-note-ids',
          JSON.stringify([share.noteId]),
        )
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onContextMenu={(e) => {
        setIsFolderMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      onDoubleClick={onOpenEdit}
      className={cn(
        'group relative flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-soft)] transition-all hover:border-[var(--border-default)] hover:shadow-md cursor-grab active:cursor-grabbing select-none',
        isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : '',
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="rounded border-[var(--border-default)] accent-[var(--accent)] shrink-0"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin()
              }}
              className={cn(
                'p-0.5 rounded transition-colors shrink-0',
                share.isPinned
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-[var(--accent)]',
              )}
              title={share.isPinned ? t('share.unpin_note') : t('share.pin_note')}
            >
              <Pin size={12} className={share.isPinned ? 'fill-current' : ''} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleStar()
              }}
              className={cn(
                'p-0.5 rounded transition-colors shrink-0',
                share.isStarred
                  ? 'text-amber-500'
                  : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-amber-500',
              )}
              title={share.isStarred ? t('share.unstar_note') : t('share.star_note')}
            >
              <Star size={12} className={share.isStarred ? 'fill-current' : ''} />
            </button>
            <span
              onClick={onOpenEdit}
              className="truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline cursor-pointer"
            >
              {share.noteTitle || t('common.untitled_note')}
            </span>
          </div>
          <Switch
            checked={share.isEnabled}
            onChange={onToggleShare}
          />
        </div>

        {share.noteExcerpt && (
          <p className="line-clamp-2 text-[length:var(--text-11)] text-[var(--text-tertiary)] pb-2">
            {share.noteExcerpt}
          </p>
        )}

        {share.slug ? (
          <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 font-mono text-[length:var(--text-11)] text-[var(--text-secondary)]">
            <span className="truncate">{`/s/${share.slug}`}</span>
            <div className="flex items-center gap-1">
              {isCustom && (
                <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[length:var(--text-9)] font-semibold text-[var(--accent)]">
                  {'CUSTOM'}
                </span>
              )}
              <button
                type="button"
                onClick={() => onCopy(share.url, share.slug!)}
                className="text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                title={t('common.copy')}
              >
                {copiedSlug === share.slug ? (
                  <Check size={12} className="text-[var(--success)]" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border-subtle)] px-2 py-1 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            {t('share.not_shared')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 text-[length:var(--text-10)] text-[var(--text-quaternary)]">
          {folder && (
            <span
              style={{ borderColor: folder.color ? `${folder.color}40` : undefined }}
              className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
            >
              <FolderClosed size={10} style={{ color: folder.color ?? undefined }} className="shrink-0" />
              <span className="max-w-[100px] truncate">{folder.name}</span>
            </span>
          )}
          {share.hasPassword && (
            <span className="flex items-center gap-0.5 text-[var(--warning)]">
              <Lock size={10} /> {t('share.password_protected')}
            </span>
          )}
          {share.expiresAt && (
            <span className={`flex items-center gap-0.5 ${isExpired ? 'text-[var(--danger)]' : ''}`}>
              <Timer size={10} />
              {isExpired ? t('share.status_expired') : relativeTime(share.expiresAt)}
            </span>
          )}
          {share.tags && share.tags.length > 0 && share.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--bg-surface)] px-1 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <div className="flex items-center gap-2 font-mono text-[length:var(--text-11)] text-[var(--text-tertiary)]">
          <span title={t('share.metric_pv')}>
            <Eye size={11} className="inline mr-0.5" />
            {share.views}
          </span>
          <span title={t('share.metric_uv')}>
            <Users size={11} className="inline mr-0.5" />
            {share.uniqueVisitors ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <IconButton
            ref={folderButtonRef}
            size="sm"
            label={t('share.batch_move_to_folder')}
            onClick={() => setIsFolderMenuOpen((prev) => !prev)}
          >
            <FolderInput size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.qr_code_title')}
            onClick={onOpenQr}
          >
            <QrCode size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.note_analytics_title')}
            onClick={onOpenAnalytics}
          >
            <BarChart2 size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.edit_share_settings')}
            onClick={onOpenEdit}
          >
            <Settings2 size={13} />
          </IconButton>

          {share.slug && (
            <a
              href={share.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title={t('preview.open_in_new_tab')}
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        <Menu
          open={isFolderMenuOpen}
          anchor={folderButtonRef}
          items={folderMenuItems}
          onClose={() => setIsFolderMenuOpen(false)}
        />

        {contextMenu.point && (
          <Menu
            open
            anchor={contextMenu.point}
            items={contextMenuItems}
            onClose={contextMenu.close}
          />
        )}
      </div>
    </div>
  )
}
