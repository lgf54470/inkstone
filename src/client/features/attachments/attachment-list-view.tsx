import { useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Eye,
  FolderClosed,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  QrCode,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useAttachmentStore } from './attachment-store'
import { Menu, useContextMenu, type MenuItem } from '../../components/overlay'
import { formatFileSize, getFileBadgeColor, getFileCategory } from './attachment-helpers'

export function AttachmentListView({
  files,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  activeFile,
  onSelectActive,
  onPreview,
  onRename,
  onShowQr,
  onInsertToNote,
  onToggleStar,
  onTogglePin,
  onMoveToFolder,
  onDelete,
  onUploadClick,
}: {
  files: AttachmentWithUsage[]
  selectedIds: Set<string>
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onToggleSelectAll: () => void
  allSelected: boolean
  activeFile: AttachmentWithUsage | null
  onSelectActive: (file: AttachmentWithUsage) => void
  onPreview: (file: AttachmentWithUsage) => void
  onRename: (file: AttachmentWithUsage) => void
  onShowQr: (file: AttachmentWithUsage) => void
  onInsertToNote?: (file: AttachmentWithUsage) => void
  onToggleStar: (file: AttachmentWithUsage) => void
  onTogglePin: (file: AttachmentWithUsage) => void
  onMoveToFolder: (file: AttachmentWithUsage) => void
  onDelete: (file: AttachmentWithUsage) => void
  onUploadClick?: () => void
}) {
  const folders = useAttachmentStore((s) => s.folders)

  return (
    <div className="flex min-h-full flex-col w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[length:var(--text-12)] border-collapse">
          <thead className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]/90 backdrop-blur-xs text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)] uppercase select-none">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border transition-colors cursor-pointer',
                    allSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border-default)] bg-[var(--bg-base)]',
                  )}
                >
                  {allSelected && <Check size={11} strokeWidth={3} />}
                </button>
              </th>
              <th className="px-3 py-2.5">{t('attachments.filename')}</th>
              <th className="px-3 py-2.5 w-32">{t('navigation.folder')}</th>
              <th className="px-3 py-2.5 w-32">{t('navigation.tag')}</th>
              <th className="px-3 py-2.5 w-24">{t('attachments.size_all')}</th>
              <th className="px-3 py-2.5 w-24">{t('attachments.unreferenced')}</th>
              <th className="px-3 py-2.5 w-28">{t('common.created')}</th>
              <th className="px-3 py-2.5 w-20 text-right">{t('common.more_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {files.map((file) => {
              const selected = selectedIds.has(file.id)
              const active = activeFile?.id === file.id
              const folder = file.folderId ? folders.find((f) => f.id === file.folderId) : null
              return (
                <ListRow
                  key={file.id}
                  file={file}
                  folderName={folder?.name}
                  selected={selected}
                  active={active}
                  onToggleSelect={(e) => onToggleSelect(file.id, e)}
                  onSelectActive={() => onSelectActive(file)}
                  onPreview={() => onPreview(file)}
                  onRename={() => onRename(file)}
                  onShowQr={() => onShowQr(file)}
                  onInsertToNote={onInsertToNote ? () => onInsertToNote(file) : undefined}
                  onToggleStar={() => onToggleStar(file)}
                  onTogglePin={() => onTogglePin(file)}
                  onMoveToFolder={() => onMoveToFolder(file)}
                  onDelete={() => onDelete(file)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {onUploadClick && files.length < 8 && (
        <div className="flex flex-1 p-4">
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
            <p className="mt-1 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)] max-w-sm">
              {t('attachments.upload_guide_hint')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function ListRow({
  file,
  folderName,
  selected,
  active,
  onToggleSelect,
  onSelectActive,
  onPreview,
  onRename,
  onShowQr,
  onInsertToNote,
  onToggleStar,
  onTogglePin,
  onMoveToFolder,
  onDelete,
}: {
  file: AttachmentWithUsage
  folderName?: string
  selected: boolean
  active: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  onSelectActive: () => void
  onPreview: () => void
  onRename: () => void
  onShowQr: () => void
  onInsertToNote?: () => void
  onToggleStar: () => void
  onTogglePin: () => void
  onMoveToFolder: () => void
  onDelete: () => void
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(file.mime, file.filename)
  const isImage = category === 'image'
  const badge = getFileBadgeColor(category, ext)

  const handleCopyMarkdown = async () => {
    try {
      const md = isImage ? `![${file.filename}](${file.url})` : `[${file.filename}](${file.url})`
      await navigator.clipboard.writeText(md)
    } catch (error) {
      console.warn('[attachments] failed to copy markdown', error)
    }
  }

  const handleCopyLink = async () => {
    try {
      const fullUrl = new URL(file.url, window.location.origin).href
      await navigator.clipboard.writeText(fullUrl)
    } catch (error) {
      console.warn('[attachments] failed to copy URL', error)
    }
  }

  const menuItems: MenuItem[] = [
    { id: 'preview', label: t('common.preview'), icon: <Eye size={13} />, onSelect: onPreview },
    ...(onInsertToNote
      ? [{ id: 'insert', label: t('attachments.insert_into_note'), icon: <Paperclip size={13} />, onSelect: onInsertToNote }]
      : []),
    { id: 'copy-markdown', label: t('attachments.copy_markdown'), icon: <Copy size={13} />, separatorBefore: true, onSelect: () => void handleCopyMarkdown() },
    { id: 'copy-link', label: t('attachments.copy_link'), icon: <Copy size={13} />, onSelect: () => void handleCopyLink() },
    { id: 'qr', label: t('attachments.qr_code_title'), icon: <QrCode size={13} />, onSelect: onShowQr },
    { id: 'star', label: file.isStarred ? t('attachments.unstar') : t('attachments.star'), icon: <Star size={13} />, separatorBefore: true, onSelect: onToggleStar },
    { id: 'pin', label: file.isPinned ? t('attachments.unpin') : t('attachments.pin'), icon: <Pin size={13} />, onSelect: onTogglePin },
    { id: 'move', label: t('attachments.move_to'), icon: <FolderClosed size={13} />, onSelect: onMoveToFolder },
    { id: 'rename', label: t('attachments.rename'), icon: <Pencil size={13} />, onSelect: onRename },
    {
      id: 'download',
      label: t('common.download'),
      icon: <Download size={13} />,
      separatorBefore: true,
      onSelect: () => {
        const a = document.createElement('a')
        a.href = file.url
        a.download = file.filename
        a.click()
      },
    },
    { id: 'delete', label: t('attachments.delete'), icon: <Trash2 size={13} />, tone: 'danger', separatorBefore: true, onSelect: onDelete },
  ]

  return (
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-inkstone-attachments', JSON.stringify([file.id]))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onSelectActive}
      onDoubleClick={onPreview}
      onContextMenu={(e) => {
        setIsMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      className={cn(
        'group transition-colors cursor-pointer select-none',
        selected
          ? 'bg-[var(--accent-soft)]'
          : active
          ? 'bg-[var(--bg-hover)]'
          : 'hover:bg-[var(--bg-hover)]',
      )}
    >
      <td className="w-10 px-3 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(e)
          }}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded border transition-colors',
            selected
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--border-default)] bg-[var(--bg-base)] opacity-0 group-hover:opacity-100',
          )}
        >
          {selected && <Check size={11} strokeWidth={3} />}
        </button>
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
            {isImage ? (
              <img src={file.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className={cn('text-[length:var(--text-9)] font-bold', badge.text)}>{badge.label}</span>
            )}
          </div>
          <span className="truncate font-medium text-[var(--text-primary)] max-w-xs md:max-w-md" title={file.filename}>
            {file.filename}
          </span>
          {file.isPinned && <Pin size={11} className="text-[var(--accent)] shrink-0" />}
          {file.isStarred && <Star size={11} className="text-amber-500 fill-current shrink-0" />}
        </div>
      </td>

      <td className="px-3 py-2 text-[var(--text-tertiary)]">
        {folderName ? (
          <span className="truncate block max-w-[120px]">{folderName}</span>
        ) : (
          <span>-</span>
        )}
      </td>

      <td className="px-3 py-2 text-[var(--text-tertiary)]">
        {file.tags && file.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {file.tags.slice(0, 2).map((tName) => (
              <span key={tName} className="rounded bg-[var(--bg-sunken)] px-1 text-[length:var(--text-10)]">
                #{tName}
              </span>
            ))}
          </div>
        ) : (
          <span>-</span>
        )}
      </td>

      <td className="px-3 py-2 text-[var(--text-tertiary)] tabular-nums">
        {formatFileSize(file.size)}
      </td>

      <td className="px-3 py-2">
        {file.references === 0 ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[length:var(--text-10)] font-medium text-amber-600 dark:text-amber-400">
            {t('attachments.unreferenced')}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)] tabular-nums">
            {t('attachments.referenced_value0', { value0: file.references })}
          </span>
        )}
      </td>

      <td className="px-3 py-2 text-[var(--text-tertiary)]">
        {new Date(file.createdAt).toLocaleDateString()}
      </td>

      <td className="px-3 py-2 text-right">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen((prev) => !prev)
          }}
          className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-colors"
        >
          <MoreHorizontal size={14} />
        </button>

        <Menu
          open={isMenuOpen}
          anchor={menuButtonRef}
          items={menuItems}
          onClose={() => setIsMenuOpen(false)}
        />
        {contextMenu.point && (
          <Menu
            open
            anchor={contextMenu.point}
            items={menuItems}
            onClose={contextMenu.close}
          />
        )}
      </td>
    </tr>
  )
}
