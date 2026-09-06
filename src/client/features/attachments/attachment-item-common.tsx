import { useRef, useState } from 'react'
import {
  Copy,
  Download,
  Eye,
  FolderClosed,
  Paperclip,
  Pencil,
  Pin,
  QrCode,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AttachmentFolder, AttachmentWithUsage } from '@shared/types'
import { t } from '../../lib/i18n'
import { useAttachmentStore } from './attachment-store'
import { Menu, useContextMenu, type MenuItem } from '../../components/overlay'
import { getFileBadgeColor, getFileCategory } from './attachment-helpers'

export interface AttachmentMenuCtx {
  file: AttachmentWithUsage
  onPreview: () => void
  onRename: () => void
  onShowQr: () => void
  onInsertToNote?: () => void
  onToggleStar: () => void
  onTogglePin: () => void
  onMoveToFolder: () => void
  onDelete: () => void
}

export function fileBadgeOf(file: AttachmentWithUsage) {
  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(file.mime, file.filename)
  return { isImage: category === 'image', badge: getFileBadgeColor(category, ext) }
}

export function useFileFolder(file: AttachmentWithUsage): AttachmentFolder | undefined {
  const folders = useAttachmentStore((s) => s.folders)
  return file.folderId ? folders.find((f) => f.id === file.folderId) : undefined
}

export function useCardMenu() {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const contextMenu = useContextMenu()
  const toggle = () => setIsOpen((prev) => !prev)
  const close = () => setIsOpen(false)
  const handleContextMenu = (e: React.MouseEvent) => {
    setIsOpen(false)
    contextMenu.onContextMenu(e)
  }
  return { buttonRef, isOpen, toggle, close, contextMenu, handleContextMenu }
}

export function AttachmentMenus({ menu, items }: { menu: ReturnType<typeof useCardMenu>; items: MenuItem[] }) {
  return (
    <>
      <Menu open={menu.isOpen} anchor={menu.buttonRef} items={items} onClose={menu.close} />
      {menu.contextMenu.point && <Menu open anchor={menu.contextMenu.point} items={items} onClose={menu.contextMenu.close} />}
    </>
  )
}

export function cardDragStart(e: React.DragEvent, fileId: string) {
  e.dataTransfer.setData('application/x-inkstone-attachments', JSON.stringify([fileId]))
  e.dataTransfer.effectAllowed = 'move'
}


async function copyFileMarkdown(file: AttachmentWithUsage) {
  try {
    const md = fileBadgeOf(file).isImage ? `![${file.filename}](${file.url})` : `[${file.filename}](${file.url})`
    await navigator.clipboard.writeText(md)
  } catch (error) {
    console.warn('[attachments] failed to copy markdown', error)
  }
}


async function copyFileUrl(file: AttachmentWithUsage) {
  try {
    const fullUrl = new URL(file.url, window.location.origin).href
    await navigator.clipboard.writeText(fullUrl)
  } catch (error) {
    console.warn('[attachments] failed to copy URL', error)
  }
}

function downloadFile(file: AttachmentWithUsage) {
  const a = document.createElement('a')
  a.href = file.url
  a.download = file.filename
  a.click()
}

export function buildAttachmentMenuItems(ctx: AttachmentMenuCtx): MenuItem[] {
  const items: MenuItem[] = [{ id: 'preview', label: t('common.preview'), icon: <Eye size={13} />, onSelect: ctx.onPreview }]
  if (ctx.onInsertToNote) {
    items.push({ id: 'insert', label: t('attachments.insert_into_note'), icon: <Paperclip size={13} />, onSelect: ctx.onInsertToNote })
  }
  items.push(
    { id: 'copy-markdown', label: t('attachments.copy_markdown'), icon: <Copy size={13} />, separatorBefore: true, onSelect: () => void copyFileMarkdown(ctx.file) },
    { id: 'copy-link', label: t('attachments.copy_link'), icon: <Copy size={13} />, onSelect: () => void copyFileUrl(ctx.file) },
    { id: 'qr', label: t('attachments.qr_code_title'), icon: <QrCode size={13} />, onSelect: ctx.onShowQr },
    { id: 'star', label: ctx.file.isStarred ? t('attachments.unstar') : t('attachments.star'), icon: <Star size={13} />, separatorBefore: true, onSelect: ctx.onToggleStar },
    { id: 'pin', label: ctx.file.isPinned ? t('attachments.unpin') : t('attachments.pin'), icon: <Pin size={13} />, onSelect: ctx.onTogglePin },
    { id: 'move', label: t('attachments.move_to'), icon: <FolderClosed size={13} />, onSelect: ctx.onMoveToFolder },
    { id: 'rename', label: t('attachments.rename'), icon: <Pencil size={13} />, onSelect: ctx.onRename },
    { id: 'download', label: t('common.download'), icon: <Download size={13} />, separatorBefore: true, onSelect: () => downloadFile(ctx.file) },
    { id: 'delete', label: t('attachments.delete'), icon: <Trash2 size={13} />, tone: 'danger', separatorBefore: true, onSelect: ctx.onDelete },
  )
  return items
}

export function UploadEmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div
      onClick={onUploadClick}
      className="flex flex-1 min-h-[180px] flex-col items-center justify-center rounded-[var(--r-xl)] border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-sunken)]/20 py-8 px-4 text-center transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/10 cursor-pointer"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs mb-3">
        <Upload size={22} />
      </div>
      <p className="text-[length:var(--text-13)] font-semibold text-[var(--text-secondary)]">
        {t('attachments.drag_drop_hint')}
      </p>
      <p className="mt-1 text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)] max-w-sm">
        {t('attachments.upload_guide_hint')}
      </p>
    </div>
  )
}