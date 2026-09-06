import { useRef, useState } from 'react'
import { BarChart2, ExternalLink, Eye, FolderClosed, FolderInput, Lock, QrCode, Settings2, Timer, Users } from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { Switch } from '../../../components/form'
import { IconButton } from '../../../components/primitives'
import { Menu, useContextMenu } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { relativeTime } from '../../../lib/time'
import { t } from '../../../lib/i18n'
import { buildFolderMenuItems, buildShareMenuItems, PinStarButtons, SlugChip, type ShareItemCallbacks } from '../share-item-common'


interface ShareGridCardProps {
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
}

export function ShareGridCard({ share, isSelected, folders, copiedSlug, onToggleSelect, onTogglePin, onToggleStar, onToggleShare, onCopy, onOpenQr, onOpenAnalytics, onOpenEdit, onMoveToFolder, onRevoke }: ShareGridCardProps) {
  const contextMenu = useContextMenu()
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)
  const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
  const folder = share.shareFolderId ? (folders.find((f) => f.id === share.shareFolderId) ?? null) : null
  const cbs: ShareItemCallbacks = { onCopyLink: onCopy, onOpenQr, onOpenAnalytics, onOpenEdit, onMoveToFolder, onToggleShare, onToggleStar, onTogglePin, onRevoke }
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/inkstone-share-note-ids', JSON.stringify([share.noteId])); e.dataTransfer.effectAllowed = 'copyMove' }}
      onContextMenu={(e) => { setIsFolderMenuOpen(false); contextMenu.onContextMenu(e) }}
      onDoubleClick={onOpenEdit}
      className={cn('group relative flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-soft)] transition-all hover:border-[var(--border-default)] hover:shadow-md cursor-grab active:cursor-grabbing select-none', isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : '')}
    >
      <div>
        <CardHeader share={share} isSelected={isSelected} onToggleSelect={onToggleSelect} onTogglePin={onTogglePin} onToggleStar={onToggleStar} onToggleShare={onToggleShare} onOpenEdit={onOpenEdit} />
        {share.noteExcerpt && (
          <p className="line-clamp-2 text-[length:var(--text-11)] text-[var(--text-tertiary)] pb-2">
            {share.noteExcerpt}
          </p>
        )}
        {share.slug ? (
          <SlugChip share={share} copiedSlug={copiedSlug} onCopy={onCopy} grouped className="flex w-full justify-between bg-[var(--bg-base)]" />
        ) : (
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border-subtle)] px-2 py-1 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            {t('share.not_shared')}
          </div>
        )}
        <CardBadges share={share} folder={folder} isExpired={isExpired} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <CardMetrics share={share} />
        <CardActions share={share} onOpenQr={onOpenQr} onOpenAnalytics={onOpenAnalytics} onOpenEdit={onOpenEdit} folderButtonRef={folderButtonRef} onToggleFolderMenu={() => setIsFolderMenuOpen((prev) => !prev)} />
      </div>
      <Menu open={isFolderMenuOpen} anchor={folderButtonRef} items={buildFolderMenuItems(share, folders, onMoveToFolder)} onClose={() => setIsFolderMenuOpen(false)} />
      {contextMenu.point && <Menu open anchor={contextMenu.point} items={buildShareMenuItems(share, folders, cbs)} onClose={contextMenu.close} />}
    </div>
  )
}

function CardHeader({ share, isSelected, onToggleSelect, onTogglePin, onToggleStar, onToggleShare, onOpenEdit }: { share: ShareInfo; isSelected: boolean; onToggleSelect: () => void; onTogglePin: () => void; onToggleStar: () => void; onToggleShare: (checked: boolean) => void; onOpenEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 pb-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="rounded border-[var(--border-default)] accent-[var(--accent)] shrink-0" />
        <PinStarButtons share={share} onTogglePin={onTogglePin} onToggleStar={onToggleStar} compact />
        <span onClick={onOpenEdit} className="truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline cursor-pointer">
          {share.noteTitle || t('common.untitled_note')}
        </span>
      </div>
      <Switch checked={share.isEnabled} onChange={onToggleShare} />
    </div>
  )
}

function CardBadges({ share, folder, isExpired }: { share: ShareInfo; folder: ShareFolder | null; isExpired: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 text-[length:var(--text-10)] text-[var(--text-quaternary)]">
      {folder && (
        <span style={{ borderColor: folder.color ? `${folder.color}40` : undefined }} className="inline-flex items-center gap-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
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
        <span key={tag} className="rounded bg-[var(--bg-surface)] px-1 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
          #{tag}
        </span>
      ))}
    </div>
  )
}

function CardMetrics({ share }: { share: ShareInfo }) {
  return (
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
  )
}

function CardActions({ share, onOpenQr, onOpenAnalytics, onOpenEdit, folderButtonRef, onToggleFolderMenu }: { share: ShareInfo; onOpenQr: () => void; onOpenAnalytics: () => void; onOpenEdit: () => void; folderButtonRef: React.Ref<HTMLButtonElement>; onToggleFolderMenu: () => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton ref={folderButtonRef} size="sm" label={t('share.batch_move_to_folder')} onClick={onToggleFolderMenu}>
        <FolderInput size={13} />
      </IconButton>
      <IconButton size="sm" label={t('share.qr_code_title')} onClick={onOpenQr}>
        <QrCode size={13} />
      </IconButton>
      <IconButton size="sm" label={t('share.note_analytics_title')} onClick={onOpenAnalytics}>
        <BarChart2 size={13} />
      </IconButton>
      <IconButton size="sm" label={t('share.edit_share_settings')} onClick={onOpenEdit}>
        <Settings2 size={13} />
      </IconButton>
      {share.slug && (
        <a href={share.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" title={t('preview.open_in_new_tab')}>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  )
}