import { useEffect, useState } from 'react'
import {
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  FolderClosed,
  Maximize2,
  Paperclip,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react'
import type { AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useNotes } from '../../store/notes'
import { useAttachmentStore } from './attachment-store'
import { Button, IconButton } from '../../components/primitives'
import { formatFileSize, getFileBadgeColor, getFileCategory } from './attachment-helpers'

export function AttachmentInspector({
  file,
  onClose,
  onRename,
  onShowQr,
  onInsertToNote,
  onDelete,
  onUpdateTags,
  onPreview,
}: {
  file: AttachmentWithUsage | null
  onClose: () => void
  onRename: (file: AttachmentWithUsage) => void
  onShowQr: (file: AttachmentWithUsage) => void
  onInsertToNote?: (file: AttachmentWithUsage) => void
  onDelete: (file: AttachmentWithUsage) => void
  onUpdateTags: (file: AttachmentWithUsage, tags: string[]) => Promise<void>
  onPreview: (file: AttachmentWithUsage) => void
}) {
  const attachmentFolders = useAttachmentStore((s) => s.folders)
  const openNote = useNotes((s) => s.openNote)

  const [referencingNotes, setReferencingNotes] = useState<Array<{ id: string; title: string; folderId: string | null }>>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedMarkdown, setCopiedMarkdown] = useState(false)

  useEffect(() => {
    if (!file) {
      setReferencingNotes([])
      return
    }
    let cancelled = false
    setLoadingNotes(true)
    api.files.referencingNotes(file.id)
      .then((res) => {
        if (!cancelled) setReferencingNotes(res.notes)
      })
      .catch(() => {
        if (!cancelled) setReferencingNotes([])
      })
      .finally(() => {
        if (!cancelled) setLoadingNotes(false)
      })
    return () => {
      cancelled = true
    }
  }, [file?.id])

  if (!file) return null

  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(file.mime, file.filename)
  const isImage = category === 'image'
  const badge = getFileBadgeColor(category, ext)

  const folder = file.folderId ? attachmentFolders.find((f) => f.id === file.folderId) : null

  const handleCopyLink = async () => {
    try {
      const fullUrl = new URL(file.url, window.location.origin).href
      await navigator.clipboard.writeText(fullUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {}
  }

  const handleCopyMarkdown = async () => {
    try {
      const md = isImage ? `![${file.filename}](${file.url})` : `[${file.filename}](${file.url})`
      await navigator.clipboard.writeText(md)
      setCopiedMarkdown(true)
      setTimeout(() => setCopiedMarkdown(false), 2000)
    } catch {}
  }

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTagInput.trim()
    if (!trimmed) {
      setAddingTag(false)
      return
    }
    const currentTags = file.tags ?? []
    if (!currentTags.includes(trimmed)) {
      await onUpdateTags(file, [...currentTags, trimmed])
    }
    setNewTagInput('')
    setAddingTag(false)
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const currentTags = file.tags ?? []
    await onUpdateTags(file, currentTags.filter((t) => t !== tagToRemove))
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {t('attachments.detail_info')}
        </span>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
        <div
          onClick={() => onPreview(file)}
          className="group relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]"
        >
          {isImage ? (
            <img
              src={file.url}
              alt={file.filename}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className={cn('flex flex-col items-center gap-1.5 p-4 rounded-xl', badge.bg)}>
              <span className={cn('text-lg font-bold tracking-wider', badge.text)}>{badge.label}</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">{file.mime}</span>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 size={20} className="text-white" />
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)] break-all">
              {file.filename}
            </h4>
            <IconButton
              label={t('attachments.rename')}
              size="sm"
              onClick={() => onRename(file)}
            >
              <Pencil size={12} />
            </IconButton>
          </div>
          <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
            {formatFileSize(file.size)}
            {file.width && file.height ? ` · ${file.width} × ${file.height}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {onInsertToNote && (
            <Button
              size="sm"
              variant="secondary"
              className="col-span-2"
              icon={<Paperclip size={13} />}
              onClick={() => onInsertToNote(file)}
            >
              {t('attachments.insert_into_note')}
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            icon={copiedMarkdown ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
            onClick={() => void handleCopyMarkdown()}
          >
            {copiedMarkdown ? t('common.copied') : t('attachments.copy_markdown')}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={copiedLink ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
            onClick={() => void handleCopyLink()}
          >
            {copiedLink ? t('common.copied') : t('attachments.copy_link')}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<QrCode size={13} />}
            onClick={() => onShowQr(file)}
          >
            {t('attachments.qr_code_title')}
          </Button>

          <a
            href={file.url}
            download={file.filename}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Download size={13} />
            <span>{t('common.download')}</span>
          </a>
        </div>

        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3 text-[12px]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <FolderClosed size={13} />
              {t('navigation.folder')}
            </span>
            <span className="font-medium text-[var(--text-primary)]">
              {folder ? folder.name : t('folders.top_level')}
            </span>
          </div>

          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <Calendar size={13} />
              {t('common.created')}
            </span>
            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              {t('navigation.tag')}
            </span>
            <IconButton
              label={t('attachments.add_tag')}
              size="sm"
              onClick={() => setAddingTag(true)}
            >
              <Plus size={12} />
            </IconButton>
          </div>

          <div className="flex flex-wrap gap-1">
            {file.tags?.map((tName) => (
              <span
                key={tName}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                <span>#{tName}</span>
                <button
                  type="button"
                  onClick={() => void handleRemoveTag(tName)}
                  className="rounded-full text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                >
                  <X size={10} />
                </button>
              </span>
            ))}

            {addingTag && (
              <form onSubmit={handleAddTag} className="inline-flex">
                <input
                  autoFocus
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onBlur={() => {
                    if (!newTagInput.trim()) setAddingTag(false)
                  }}
                  placeholder={t('attachments.add_tag')}
                  className="h-6 w-24 rounded-full border border-[var(--accent)] bg-[var(--bg-base)] px-2 text-[11px] outline-none"
                />
              </form>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">
            {t('attachments.referencing_notes')}
          </span>

          {loadingNotes ? (
            <p className="text-[11.5px] text-[var(--text-quaternary)]">{t('common.loading')}</p>
          ) : referencingNotes.length === 0 ? (
            <p className="text-[11.5px] text-[var(--text-quaternary)]">
              {t('attachments.no_referencing_notes')}
            </p>
          ) : (
            <div className="space-y-1">
              {referencingNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openNote(note.id)}
                  className="flex w-full items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 text-left text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <FileText size={13} className="shrink-0 text-[var(--text-quaternary)]" />
                  <span className="truncate">{note.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-3">
          <Button
            size="sm"
            variant="danger"
            className="w-full"
            icon={<Trash2 size={13} />}
            onClick={() => onDelete(file)}
          >
            {t('attachments.delete')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
