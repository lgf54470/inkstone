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
  Star,
  Trash2,
} from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { Switch } from '../../../components/form'
import { IconButton } from '../../../components/primitives'
import { Menu, useContextMenu, type MenuItem } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { relativeTime } from '../../../lib/time'
import { t } from '../../../lib/i18n'

export function ShareTableRow({
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
        setIsFolderMenuOpen(false)
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
              className="font-medium text-[length:var(--text-13)] text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline cursor-pointer"
            >
              {share.noteTitle || t('common.untitled_note')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-12">
            {folder && (
              <span
                style={{ borderColor: folder.color ? `${folder.color}40` : undefined }}
                className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                <FolderClosed size={10} style={{ color: folder.color ?? undefined }} className="shrink-0" />
                <span className="max-w-[100px] truncate">{folder.name}</span>
              </span>
            )}
            {share.tags && share.tags.length > 0 && share.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--bg-card)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]"
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
          <div className="inline-flex items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 font-mono text-[length:var(--text-11)] text-[var(--text-secondary)]">
            <span className="truncate max-w-[120px]">{`/s/${share.slug}`}</span>
            {isCustom && (
              <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.2 text-[length:var(--text-9)] font-semibold text-[var(--accent)]">
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
          <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            {t('share.not_shared')}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1 text-[length:var(--text-11)]">
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

      <td className="px-3 py-2.5 text-right font-mono text-[length:var(--text-12)]">
        <div className="text-[var(--text-primary)] font-semibold">
          {share.views} <span className="text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]">{'PV'}</span>
        </div>
        <div className="text-[length:var(--text-11)] text-[var(--text-tertiary)]">
          {share.uniqueVisitors ?? 0}{' '}
          <span className="text-[length:var(--text-10)] text-[var(--text-quaternary)]">{'UV'}</span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-right text-[length:var(--text-11)] text-[var(--text-tertiary)]">
        {share.lastViewedAt ? relativeTime(share.lastViewedAt) : t('share.never_visited')}
      </td>

      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
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
      </td>
    </tr>
  )
}
