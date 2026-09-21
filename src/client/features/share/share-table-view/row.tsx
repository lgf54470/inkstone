import { memo, useRef, useState } from 'react'
import { BarChart2, ExternalLink, FolderClosed, FolderInput, Lock, MoreHorizontal, QrCode, Settings2 } from 'lucide-react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { EXPIRING_SOON_DAYS } from '@shared/constants'
import { Checkbox, Switch } from '../../../components/form'
import { Button, IconButton } from '../../../components/primitives'
import { Menu, useContextMenu } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { relativeTime } from '../../../lib/time'
import { t } from '../../../lib/i18n'
import { buildFolderMenuItems, buildShareMenuItems, PinStarButtons, SlugChip, type ShareItemCallbacks } from '../share-item-common'

interface ShareTableRowProps {
  share: ShareInfo
  isSelected: boolean
  folders: ShareFolder[]
  folderById: Map<string, ShareFolder>
  copiedSlug: string | null
  onToggleSelect: (noteId: string) => void
  onTogglePin: (noteId: string) => void
  onToggleStar: (noteId: string) => void
  onToggleShare: (noteId: string, checked: boolean) => void
  onCopyLink: (url: string, slug: string) => void
  onOpenQr: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
  onMoveToFolder: (noteId: string, folderId: string | null) => void
  onRevoke: (share: ShareInfo) => void
}

export const ShareTableRow = memo(function ShareTableRow({ share, isSelected, folders, folderById, copiedSlug, onToggleSelect, onTogglePin, onToggleStar, onToggleShare, onCopyLink, onOpenQr, onOpenAnalytics, onOpenEdit, onMoveToFolder, onRevoke }: ShareTableRowProps) {
  const contextMenu = useContextMenu()
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const isExpired = share.expiresAt ? share.expiresAt < Date.now() : false
  const noteId = share.noteId
  const cbs: ShareItemCallbacks = { onCopyLink, onOpenQr: () => onOpenQr(share), onOpenAnalytics: () => onOpenAnalytics(share), onOpenEdit: () => onOpenEdit(share), onMoveToFolder: (folderId) => onMoveToFolder(noteId, folderId), onToggleShare: (checked) => onToggleShare(noteId, checked), onToggleStar: () => onToggleStar(noteId), onTogglePin: () => onTogglePin(noteId), onRevoke: () => onRevoke(share) }
  return (
    <tr
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/inkstone-share-note-ids', JSON.stringify([share.noteId])); e.dataTransfer.effectAllowed = 'copyMove' }}
      onContextMenu={(e) => { setIsFolderMenuOpen(false); setIsMoreMenuOpen(false); contextMenu.onContextMenu(e) }}
      onDoubleClick={() => onOpenEdit(share)}
      className={cn('group transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing select-none', isSelected ? 'bg-[var(--accent-soft)]/30' : '')}
    >
      <td className='px-3 py-2.5 text-center'>
        <Checkbox checked={isSelected} onChange={() => onToggleSelect(noteId)} aria-label={share.noteTitle || t('common.untitled_note')} className='min-h-0' />
      </td>
      <td className='px-3 py-2.5'>
        <RowTitleCell share={share} folderById={folderById} onTogglePin={() => onTogglePin(noteId)} onToggleStar={() => onToggleStar(noteId)} onOpenEdit={() => onOpenEdit(share)} />
      </td>
      <td className='px-3 py-2.5 text-center'>
        <Switch checked={share.isEnabled} onChange={(checked) => onToggleShare(noteId, checked)} label={t('share.share_switch_aria', { title: share.noteTitle || t('common.untitled_note') })} />
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
      <RowStatsCells share={share} />
      <td className='px-3 py-2.5 text-right'>
        <RowActions share={share} onOpenQr={() => onOpenQr(share)} onOpenAnalytics={() => onOpenAnalytics(share)} onOpenEdit={() => onOpenEdit(share)} folderButtonRef={folderButtonRef} isFolderMenuOpen={isFolderMenuOpen} onToggleFolderMenu={() => setIsFolderMenuOpen((prev) => !prev)} moreButtonRef={moreButtonRef} isMoreMenuOpen={isMoreMenuOpen} onToggleMoreMenu={() => { setIsFolderMenuOpen(false); setIsMoreMenuOpen((prev) => !prev) }} />
        {isFolderMenuOpen && <Menu open anchor={folderButtonRef} items={buildFolderMenuItems(share, folders, (folderId) => onMoveToFolder(noteId, folderId))} onClose={() => setIsFolderMenuOpen(false)} />}
        {isMoreMenuOpen && <Menu open anchor={moreButtonRef} items={buildShareMenuItems(share, folders, cbs)} onClose={() => setIsMoreMenuOpen(false)} />}
        {contextMenu.point && <Menu open anchor={contextMenu.point} items={buildShareMenuItems(share, folders, cbs)} onClose={contextMenu.close} />}
      </td>
    </tr>
  )
})

function RowStatsCells({ share }: { share: ShareInfo }) {
  return (
    <>
      <td className='px-3 py-2.5 text-right font-mono text-[length:var(--text-12)]'>
        <div className='text-[var(--text-primary)] font-semibold'>{share.views} <span className='text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]'>{t('share.unit_pv')}</span></div>
        <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{share.uniqueVisitors ?? 0} <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{t('share.unit_uv')}</span></div>
      </td>
      <td className='px-3 py-2.5 text-right text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {share.lastViewedAt ? relativeTime(share.lastViewedAt) : t('share.never_visited')}
      </td>
    </>
  )
}

function RowTitleCell({ share, folderById, onTogglePin, onToggleStar, onOpenEdit }: { share: ShareInfo; folderById: Map<string, ShareFolder>; onTogglePin: () => void; onToggleStar: () => void; onOpenEdit: () => void }) {
  const folder = share.shareFolderId ? folderById.get(share.shareFolderId) ?? null : null
  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-1.5'>
        <PinStarButtons share={share} onTogglePin={onTogglePin} onToggleStar={onToggleStar} />
        <Button variant='ghost' onClick={onOpenEdit} className='h-auto min-w-0 justify-start p-0 text-left font-medium text-[length:var(--text-13)] text-[var(--text-primary)] hover:bg-transparent hover:text-[var(--accent)] hover:underline'>
          {share.noteTitle || t('common.untitled_note')}
        </Button>
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
          // A date inside EXPIRING_SOON_DAYS is the row a person may want to extend, so it wears the
          // warning tone the category and the batch-extension flow use for the same deadline.
          <span className={share.expiresAt - Date.now() <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000 ? 'text-[var(--warning)]' : 'text-[var(--text-tertiary)]'}>
            {relativeTime(share.expiresAt)}
          </span>
        ) : (
          <span className='text-[var(--text-quaternary)]'>{t('share.never_expires')}</span>
        )}
      </div>
    </div>
  )
}

function RowActions({ share, onOpenQr, onOpenAnalytics, onOpenEdit, folderButtonRef, isFolderMenuOpen, onToggleFolderMenu, moreButtonRef, isMoreMenuOpen, onToggleMoreMenu }: { share: ShareInfo; onOpenQr: () => void; onOpenAnalytics: () => void; onOpenEdit: () => void; folderButtonRef: React.Ref<HTMLButtonElement>; isFolderMenuOpen: boolean; onToggleFolderMenu: () => void; moreButtonRef: React.Ref<HTMLButtonElement>; isMoreMenuOpen: boolean; onToggleMoreMenu: () => void }) {
  return (
    <div className='flex items-center justify-end gap-1'>
      <IconButton ref={folderButtonRef} size='sm' label={t('share.batch_move_to_folder')} aria-haspopup='menu' aria-expanded={isFolderMenuOpen} onClick={onToggleFolderMenu}>
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
      <IconButton ref={moreButtonRef} size='sm' label={t('common.more_actions')} aria-haspopup='menu' aria-expanded={isMoreMenuOpen} onClick={onToggleMoreMenu}>
        <MoreHorizontal size={13} />
      </IconButton>
    </div>
  )
}
