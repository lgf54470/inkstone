import { useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Eye,
  FolderClosed,
  MoreVertical,
  Paperclip,
  Pencil,
  Pin,
  Plus,
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
import {
  formatFileSize,
  getFileBadgeColor,
  getFileCategory,
  groupAttachmentsByDate,
} from './attachment-helpers'

export function AttachmentGridView({
  files,
  selectedIds,
  onToggleSelect,
  activeFile,
  onSelectActive,
  zoom,
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
  activeFile: AttachmentWithUsage | null
  onSelectActive: (file: AttachmentWithUsage) => void
  zoom: 'sm' | 'md' | 'lg'
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
  const groups = groupAttachmentsByDate(files)

  const gridColsClass =
    zoom === 'sm'
      ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
      : zoom === 'lg'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'

  return (
    <div className="flex min-h-full flex-col p-4 gap-6">
      {groups.map((group, groupIdx) => (
        <div key={group.label} className="space-y-2.5">
          <div className="sticky top-0 z-[var(--z-sticky)] bg-[var(--bg-surface)]/90 py-1 backdrop-blur-xs">
            <h3 className="text-[12px] font-semibold tracking-wider text-[var(--text-tertiary)] uppercase">
              {group.label}
            </h3>
          </div>

          <div className={cn('grid gap-3', gridColsClass)}>
            {group.files.map((file) => (
              <GridCard
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                active={activeFile?.id === file.id}
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
            ))}

            {groupIdx === 0 && onUploadClick && (
              <button
                type="button"
                onClick={onUploadClick}
                className="group relative flex aspect-square flex-col items-center justify-center rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-sunken)]/20 p-3 text-center transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/20 cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-tertiary)] shadow-xs transition-transform group-hover:scale-110 group-hover:text-[var(--accent)]">
                  <Plus size={20} />
                </div>
                <span className="mt-2 text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)]">
                  {t('attachments.upload_file')}
                </span>
              </button>
            )}
          </div>
        </div>
      ))}

      {onUploadClick && files.length < 8 && (
        <div
          onClick={onUploadClick}
          className="flex flex-1 min-h-[180px] flex-col items-center justify-center rounded-[var(--r-xl)] border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-sunken)]/20 py-8 px-4 text-center transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/10 cursor-pointer"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs mb-3">
            <Upload size={22} />
          </div>
          <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
            {t('attachments.drag_drop_hint')}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)] max-w-sm">
            {t('attachments.upload_guide_hint')}
          </p>
        </div>
      )}
    </div>
  )
}

function GridCard({
  file,
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
  const folders = useAttachmentStore((s) => s.folders)
  const folder = file.folderId ? folders.find((f) => f.id === file.folderId) : null

  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
    {
      id: 'preview',
      label: t('common.preview'),
      icon: <Eye size={13} />,
      onSelect: onPreview,
    },
    ...(onInsertToNote
      ? [
          {
            id: 'insert',
            label: t('attachments.insert_into_note'),
            icon: <Paperclip size={13} />,
            onSelect: onInsertToNote,
          },
        ]
      : []),
    {
      id: 'copy-markdown',
      label: t('attachments.copy_markdown'),
      icon: <Copy size={13} />,
      separatorBefore: true,
      onSelect: () => void handleCopyMarkdown(),
    },
    {
      id: 'copy-link',
      label: t('attachments.copy_link'),
      icon: <Copy size={13} />,
      onSelect: () => void handleCopyLink(),
    },
    {
      id: 'qr',
      label: t('attachments.qr_code_title'),
      icon: <QrCode size={13} />,
      onSelect: onShowQr,
    },
    {
      id: 'star',
      label: file.isStarred ? t('attachments.unstar') : t('attachments.star'),
      icon: <Star size={13} />,
      separatorBefore: true,
      onSelect: onToggleStar,
    },
    {
      id: 'pin',
      label: file.isPinned ? t('attachments.unpin') : t('attachments.pin'),
      icon: <Pin size={13} />,
      onSelect: onTogglePin,
    },
    {
      id: 'move',
      label: t('attachments.move_to'),
      icon: <FolderClosed size={13} />,
      onSelect: onMoveToFolder,
    },
    {
      id: 'rename',
      label: t('attachments.rename'),
      icon: <Pencil size={13} />,
      onSelect: onRename,
    },
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
    {
      id: 'delete',
      label: t('attachments.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: onDelete,
    },
  ]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-inkstone-attachments', JSON.stringify([file.id]))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onSelectActive}
      onDoubleClick={onPreview}
      onContextMenu={(e) => {
        setMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[var(--r-lg)] border bg-[var(--bg-base)] text-left transition-all duration-150 cursor-pointer select-none',
        selected
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
          : active
          ? 'border-[var(--accent)] shadow-sm'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:shadow-xs',
      )}
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-[var(--bg-sunken)]">
        {isImage ? (
          <img
            src={file.url}
            alt={file.filename}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4">
            <div className={cn('flex flex-col items-center gap-1 rounded-xl p-3', badge.bg)}>
              <span className={cn('text-sm font-bold tracking-wider', badge.text)}>{badge.label}</span>
            </div>
          </div>
        )}

        <div
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(e)
          }}
          className={cn(
            'absolute top-2 left-2 z-[var(--z-sticky)] flex h-5 w-5 items-center justify-center rounded transition-opacity',
            selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <div
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border shadow-xs transition-colors',
              selected
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-white/80 bg-black/40 hover:bg-black/60',
            )}
          >
            {selected && <Check size={11} strokeWidth={3} />}
          </div>
        </div>

        <div className="absolute top-2 right-2 z-[var(--z-sticky)] flex items-center gap-1">
          {file.isPinned && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-xs">
              <Pin size={10} />
            </div>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStar()
            }}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full transition-opacity',
              file.isStarred
                ? 'bg-amber-500 text-white'
                : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white',
            )}
          >
            <Star size={10} className={file.isStarred ? 'fill-current' : undefined} />
          </button>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((prev) => !prev)
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
          >
            <MoreVertical size={11} />
          </button>
        </div>

        {file.references === 0 && (
          <div className="absolute bottom-1.5 left-1.5 rounded px-1 py-0.5 text-[9px] font-medium bg-amber-500/85 text-white backdrop-blur-xs">
            {t('attachments.unreferenced')}
          </div>
        )}
      </div>

      <div className="p-2 space-y-1">
        <p className="truncate text-[12px] font-medium text-[var(--text-primary)]" title={file.filename}>
          {file.filename}
        </p>

        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
          <span>{formatFileSize(file.size)}</span>
          {folder && (
            <span className="truncate max-w-[80px]" title={folder.name}>
              {folder.name}
            </span>
          )}
        </div>

        {file.tags && file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {file.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--bg-sunken)] px-1 py-0.2 text-[10px] text-[var(--text-tertiary)]"
              >
                #{tag}
              </span>
            ))}
            {file.tags.length > 2 && (
              <span className="text-[10px] text-[var(--text-quaternary)]">
                +{file.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      <Menu
        open={menuOpen}
        anchor={menuButtonRef}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      {contextMenu.point && (
        <Menu
          open
          anchor={contextMenu.point}
          items={menuItems}
          onClose={contextMenu.close}
        />
      )}
    </div>
  )
}
