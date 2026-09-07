import { useRef, useState } from 'react'
import { BarChart2, ExternalLink, FolderClosed, FolderInput, Lock, QrCode, Settings2 } from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { Switch } from '../../../components/form'
import { IconButton } from '../../../components/primitives'
import { Menu, useContextMenu } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { relativeTime } from '../../../lib/time'
import { t } from '../../../lib/i18n'
import { buildFolderMenuItems, buildShareMenuItems, PinStarButtons, SlugChip, type ShareItemCallbacks } from '../share-item-common'


interface ShareTableRowProps {
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
}

export function ShareTableRow({ share, isSelected, folders, copiedSlug, onToggleSelect, onTogglePin, onToggleStar, onToggleShare, onCopyLink, onOpenQrModal, onOpenAnalytics, onOpenEdit, onMoveToFolder, onRevoke }: ShareTableRowProps) {
  const contextMenu = useContextMenu()
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)
  const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
  const cbs: ShareItemCallbacks = { onCopyLink, onOpenQr: () => onOpenQrModal(share), onOpenAnalytics: () => onOpenAnalytics(share), onOpenEdit: () => onOpenEdit(share), onMoveToFolder, onToggleShare, onToggleStar, onTogglePin, onRevoke }
  return (
    <tr
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/inkstone-share-note-ids', JSON.stringify([share.noteId])); e.dataTransfer.effectAllowed = 'copyMove' }}
      onContextMenu={(e) => { setIsFolderMenuOpen(false); contextMenu.onContextMenu(e) }}
      onDoubleClick={() => onOpenEdit(share)}
      className={cn('group transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing select-none', isSelected ? 'bg-[var(--accent-subtle)]/30' : '')}
    >
      <td className='px-3 py-2.5 text-center'>
        <input type='checkbox' checked={isSelected} onChange={onToggleSelect} className='rounded border-[var(--border-default)] accent-[var(--accent)]' />
      </td>
      <td className='px-3 py-2.5'>
        <RowTitleCell share={share} folders={folders} onTogglePin={onTogglePin} onToggleStar={onToggleStar} onOpenEdit={() => onOpenEdit(share)} />
      </td>
      <td className='px-3 py-2.5 text-center'>
        <Switch checked={share.isEnabled} onChange={onToggleShare} />
      </td>
      <td className='px-3 py-2.5'>
        {share.slug ? (
          <SlugChip share={share} copiedSlug={copiedSlug} onCopy={onCopyLink} className='inline-flex' />
        ) : (
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            {t('share.not_shared')}
          </span>
        )}
      </td>
      <td className='px-3 py-2.5'>
        <AccessCell share={share} isExpired={isExpired} />
      </td>
      <td className='px-3 py-2.5 text-right font-mono text-[length:var(--text-12)]'>
        <div className='text-[var(--text-primary)] font-semibold'>{share.views} <span className='text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]'>{'PV'}</span></div>
        <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{share.uniqueVisitors ?? 0} <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{'UV'}</span></div>
      </td>
      <td className='px-3 py-2.5 text-right text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {share.lastViewedAt ? relativeTime(share.lastViewedAt) : t('share.never_visited')}
      </td>
      <td className='px-3 py-2.5 text-right'>
        <RowActions share={share} onOpenQr={() => onOpenQrModal(share)} onOpenAnalytics={() => onOpenAnalytics(share)} onOpenEdit={() => onOpenEdit(share)} folderButtonRef={folderButtonRef} onToggleFolderMenu={() => setIsFolderMenuOpen((prev) => !prev)} />
        <Menu open={isFolderMenuOpen} anchor={folderButtonRef} items={buildFolderMenuItems(share, folders, onMoveToFolder)} onClose={() => setIsFolderMenuOpen(false)} />
        {contextMenu.point && <Menu open anchor={contextMenu.point} items={buildShareMenuItems(share, folders, cbs)} onClose={contextMenu.close} />}
      </td>
    </tr>
  )
}

function RowTitleCell({ share, folders, onTogglePin, onToggleStar, onOpenEdit }: { share: ShareInfo; folders: ShareFolder[]; onTogglePin: () => void; onToggleStar: () => void; onOpenEdit: () => void }) {
  const folder = share.shareFolderId ? folders.find((f) => f.id === share.shareFolderId) : null
  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-1.5'>
        <PinStarButtons share={share} onTogglePin={onTogglePin} onToggleStar={onToggleStar} />
        <span onClick={onOpenEdit} className='font-medium text-[length:var(--text-13)] text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline cursor-pointer'>
          {share.noteTitle || t('common.untitled_note')}
        </span>
      </div>
      <div className='flex flex-wrap items-center gap-1.5 pt-1 pl-12'>
        {folder && (
          <span style={{ borderColor: folder.color ? `${folder.color}40` : undefined }} className='inline-flex items-center gap-1 rounded bg-[var(--bg-surface)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'>
            <FolderClosed size={10} style={{ color: folder.color ?? undefined }} className='shrink-0' />
            <span className='max-w-[100px] truncate'>{folder.name}</span>
          </span>
        )}
        {share.tags && share.tags.length > 0 && share.tags.map((tag) => (
          <span key={tag} className='rounded bg-[var(--bg-card)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]'>
            #{tag}
          </span>
        ))}
      </div>
    </div>
  )
}

function AccessCell({ share, isExpired }: { share: ShareInfo; isExpired: boolean }) {
  return (
    <div className='flex flex-col gap-1 text-[length:var(--text-11)]'>
      <div className='flex items-center gap-1'>
        {share.hasPassword ? (
          <span className='inline-flex items-center gap-0.5 text-[var(--warning)]'>
            <Lock size={11} /> {t('share.password_protected')}
          </span>
        ) : (
          <span className='text-[var(--text-tertiary)]'>{t('share.public_access')}</span>
        )}
      </div>
      <div>
        {isExpired ? (
          <span className='text-[var(--danger)]'>{t('share.status_expired')}</span>
        ) : share.expiresAt ? (
          <span className='text-[var(--text-tertiary)]'>
            {relativeTime(share.expiresAt)}
          </span>
        ) : (
          <span className='text-[var(--text-quaternary)]'>{t('share.never_expires')}</span>
        )}
      </div>
    </div>
  )
}

function RowActions({ share, onOpenQr, onOpenAnalytics, onOpenEdit, folderButtonRef, onToggleFolderMenu }: { share: ShareInfo; onOpenQr: () => void; onOpenAnalytics: () => void; onOpenEdit: () => void; folderButtonRef: React.Ref<HTMLButtonElement>; onToggleFolderMenu: () => void }) {
  return (
    <div className='flex items-center justify-end gap-1'>
      <IconButton ref={folderButtonRef} size='sm' label={t('share.batch_move_to_folder')} onClick={onToggleFolderMenu}>
        <FolderInput size={13} />
      </IconButton>
      <IconButton size='sm' label={t('share.qr_code_title')} onClick={onOpenQr}>
        <QrCode size={13} />
      </IconButton>
      <IconButton size='sm' label={t('share.note_analytics_title')} onClick={onOpenAnalytics}>
        <BarChart2 size={13} />
      </IconButton>
      <IconButton size='sm' label={t('share.edit_share_settings')} onClick={onOpenEdit}>
        <Settings2 size={13} />
      </IconButton>
      {share.slug && (
        <a href={share.url} target='_blank' rel='noopener noreferrer' className='inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]' title={t('preview.open_in_new_tab')}>
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  )
}