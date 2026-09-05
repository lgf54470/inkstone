import { useRef, useState } from 'react'
import {
  BarChart2,
  Check,
  Copy,
  ExternalLink,
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
  Trash2,
} from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { Switch } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { Menu, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useShareStore } from './share-store'

export function ShareTableView({
  shares,
  onOpenQr: onOpenQrModal,
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
  const toggleSelectAll = useShareStore((s) => s.toggleSelectAll)
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)
  const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
  const batchToggle = useShareStore((s) => s.batchToggle)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const allSelected = shares.length > 0 && selectedNoteIds.size === shares.length

  const handleCopyLink = async (url: string, slug: string) => {
    try {
      const full = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
      await navigator.clipboard.writeText(full)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
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
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          {t('share.no_shares_found')}
        </p>
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('share.no_shares_hint')}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[var(--bg-card)] shadow-xs">
          <tr className="border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-tertiary)]">
            <th className="w-10 px-3 py-2 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-[var(--border-default)] accent-[var(--accent)]"
              />
            </th>
            <th className="px-3 py-2">{t('share.table_note_title')}</th>
            <th className="w-20 px-3 py-2 text-center">{t('share.table_status')}</th>
            <th className="w-48 px-3 py-2">{t('share.table_link')}</th>
            <th className="w-28 px-3 py-2">{t('share.table_security_expiry')}</th>
            <th className="w-24 px-3 py-2 text-right">{t('share.table_pv_uv')}</th>
            <th className="w-28 px-3 py-2 text-right">{t('share.table_last_visit')}</th>
            <th className="w-40 px-3 py-2 text-right">{t('share.table_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {shares.map((share) => {
            const isSelected = selectedNoteIds.has(share.noteId)
            return (
              <ShareTableRow
                key={share.noteId}
                share={share}
                isSelected={isSelected}
                folders={folders}
                copiedSlug={copiedSlug}
                onToggleSelect={() => toggleSelect(share.noteId)}
                onTogglePin={() => void togglePin(share.noteId)}
                onToggleStar={() => void toggleStar(share.noteId)}
                onToggleShare={(checked) => void toggleShare(share.noteId, checked)}
                onCopyLink={handleCopyLink}
                onOpenQrModal={onOpenQrModal}
                onOpenAnalytics={onOpenAnalytics}
                onOpenEdit={onOpenEdit}
                onMoveToFolder={(folderId) => void handleMoveToFolder(share.noteId, folderId)}
                onRevoke={() => void handleRevoke(share)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ShareTableRow({
  share,
  isSelected,
  folders,
  copiedSlug,
  onToggleSelect,
  onTogglePin,
  onToggleStar,
  onToggleShare,
  onCopyLink,
  onOpenQrModal,
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
  onCopyLink: (url: string, slug: string) => void
  onOpenQrModal: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
  onMoveToFolder: (folderId: string | null) => void
  onRevoke: () => void
}) {
  const contextMenu = useContextMenu()
  const [folderMenuOpen, setFolderMenuOpen] = useState(false)
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
            onSelect: () => onCopyLink(share.url, share.slug!),
          },
        ]
      : []),
    {
      id: 'qr',
      label: t('share.qr_code_title'),
      icon: <QrCode size={13} />,
      onSelect: () => onOpenQrModal(share),
    },
    {
      id: 'analytics',
      label: t('share.view_note_analytics'),
      icon: <BarChart2 size={13} />,
      onSelect: () => onOpenAnalytics(share),
    },
    {
      id: 'settings',
      label: t('share.edit_share_settings'),
      icon: <Settings2 size={13} />,
      onSelect: () => onOpenEdit(share),
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
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
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
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
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
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/inkstone-share-note-ids',
          JSON.stringify([share.noteId]),
        )
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onContextMenu={(e) => {
        setFolderMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      onDoubleClick={() => onOpenEdit(share)}
      className={cn(
        'group transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing select-none',
        isSelected ? 'bg-[var(--accent-subtle)]/30' : '',
      )}
    >
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-[var(--border-default)] accent-[var(--accent)]"
        />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin()
              }}
              className={cn(
                'p-1 rounded transition-colors',
                share.isPinned
                  ? 'text-[var(--accent)] bg-[var(--accent-subtle)]'
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
                'p-1 rounded transition-colors',
                share.isStarred
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-[var(--text-quaternary)] opacity-40 hover:opacity-100 hover:text-amber-500',
              )}
              title={share.isStarred ? t('share.unstar_note') : t('share.star_note')}
            >
              <Star size={12} className={share.isStarred ? 'fill-current' : ''} />
            </button>
            <span
              onClick={() => onOpenEdit(share)}
              className="font-medium text-[13px] text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline cursor-pointer"
            >
              {share.noteTitle || t('common.untitled_note')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-12">
            {folder && (
              <span
                style={{ borderColor: folder.color ? `${folder.color}40` : undefined }}
                className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.2 text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                <FolderClosed size={10} style={{ color: folder.color ?? undefined }} className="shrink-0" />
                <span className="max-w-[100px] truncate">{folder.name}</span>
              </span>
            )}
            {share.tags && share.tags.length > 0 && share.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--bg-card)] px-1.5 py-0.2 text-[10px] text-[var(--text-tertiary)] border border-[var(--border-subtle)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5 text-center">
        <Switch
          checked={share.isEnabled}
          onChange={onToggleShare}
        />
      </td>

      <td className="px-3 py-2.5">
        {share.slug ? (
          <div className="inline-flex items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
            <span className="truncate max-w-[120px]">{`/s/${share.slug}`}</span>
            {isCustom && (
              <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[9px] font-semibold text-[var(--accent)]">
                {'CUSTOM'}
              </span>
            )}
            <button
              type="button"
              onClick={() => onCopyLink(share.url, share.slug!)}
              className="ml-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
              title={t('common.copy')}
            >
              {copiedSlug === share.slug ? (
                <Check size={12} className="text-[var(--success)]" />
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--text-quaternary)]">
            {t('share.not_shared')}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center gap-1">
            {share.hasPassword ? (
              <span className="inline-flex items-center gap-0.5 text-[var(--warning)]">
                <Lock size={11} /> {t('share.password_protected')}
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">{t('share.public_access')}</span>
            )}
          </div>
          <div>
            {isExpired ? (
              <span className="text-[var(--danger)]">{t('share.status_expired')}</span>
            ) : share.expiresAt ? (
              <span className="text-[var(--text-tertiary)]">
                {relativeTime(share.expiresAt)}
              </span>
            ) : (
              <span className="text-[var(--text-quaternary)]">{t('share.never_expires')}</span>
            )}
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5 text-right font-mono text-[12px]">
        <div className="text-[var(--text-primary)] font-semibold">
          {share.views} <span className="text-[10px] font-normal text-[var(--text-tertiary)]">{'PV'}</span>
        </div>
        <div className="text-[11px] text-[var(--text-tertiary)]">
          {share.uniqueVisitors ?? 0}{' '}
          <span className="text-[10px] text-[var(--text-quaternary)]">{'UV'}</span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-right text-[11px] text-[var(--text-tertiary)]">
        {share.lastViewedAt ? relativeTime(share.lastViewedAt) : t('share.never_visited')}
      </td>

      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <IconButton
            ref={folderButtonRef}
            size="sm"
            label={t('share.batch_move_to_folder')}
            onClick={() => setFolderMenuOpen((prev) => !prev)}
          >
            <FolderInput size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.qr_code_title')}
            onClick={() => onOpenQrModal(share)}
          >
            <QrCode size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.note_analytics_title')}
            onClick={() => onOpenAnalytics(share)}
          >
            <BarChart2 size={13} />
          </IconButton>

          <IconButton
            size="sm"
            label={t('share.edit_share_settings')}
            onClick={() => onOpenEdit(share)}
          >
            <Settings2 size={13} />
          </IconButton>

          {share.slug && (
            <a
              href={share.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
              title={t('preview.open_in_new_tab')}
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        <Menu
          open={folderMenuOpen}
          anchor={folderButtonRef}
          items={folderMenuItems}
          onClose={() => setFolderMenuOpen(false)}
        />

        {contextMenu.point && (
          <Menu
            open
            anchor={contextMenu.point}
            items={contextMenuItems}
            onClose={contextMenu.close}
          />
        )}
      </td>
    </tr>
  )
}
