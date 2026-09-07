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
import { COPY_FEEDBACK_MS } from '@shared/constants'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useNotes } from '../../store/notes'
import { useAttachmentStore } from './attachment-store'
import { Button, IconButton } from '../../components/primitives'
import { formatFileSize, getFileBadgeColor, getFileCategory } from './attachment-helpers'


interface AttachmentInspectorProps {
  file: AttachmentWithUsage | null
  onClose: () => void
  onRename: (file: AttachmentWithUsage) => void
  onShowQr: (file: AttachmentWithUsage) => void
  onInsertToNote?: (file: AttachmentWithUsage) => void
  onDelete: (file: AttachmentWithUsage) => void
  onUpdateTags: (file: AttachmentWithUsage, tags: string[]) => Promise<void>
  onPreview: (file: AttachmentWithUsage) => void
}

interface ReferencingNote {
  id: string
  title: string
  folderId: string | null
}

function useInspectorNotes(file: AttachmentWithUsage | null) {
  const [referencingNotes, setReferencingNotes] = useState<ReferencingNote[]>([])
  const [isLoadingNotes, setIsLoadingNotes] = useState(false)

  useEffect(() => {
    if (!file) {
      setReferencingNotes([])
      return
    }
    let isCancelled = false
    setIsLoadingNotes(true)
    void (async () => {
      try {
        const res = await api.files.referencingNotes(file.id)
        if (!isCancelled) setReferencingNotes(res.notes)
      } catch {
        if (!isCancelled) setReferencingNotes([])
      } finally {
        if (!isCancelled) setIsLoadingNotes(false)
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [file?.id])

  return { referencingNotes, isLoadingNotes }
}

function useCopyActions(file: AttachmentWithUsage | null) {
  const [isCopiedLink, setIsCopiedLink] = useState(false)
  const [isCopiedMarkdown, setIsCopiedMarkdown] = useState(false)

  const handleCopyLink = async () => {
    if (!file) return
    try {
      const fullUrl = new URL(file.url, window.location.origin).href
      await navigator.clipboard.writeText(fullUrl)
      setIsCopiedLink(true)
      setTimeout(() => setIsCopiedLink(false), COPY_FEEDBACK_MS)
    } catch (error) {
      console.warn('[attachments] failed to copy link', error)
    }
  }

  const handleCopyMarkdown = async () => {
    if (!file) return
    try {
      const md = isImageOf(file) ? `![${file.filename}](${file.url})` : `[${file.filename}](${file.url})`
      await navigator.clipboard.writeText(md)
      setIsCopiedMarkdown(true)
      setTimeout(() => setIsCopiedMarkdown(false), COPY_FEEDBACK_MS)
    } catch (error) {
      console.warn('[attachments] failed to copy markdown', error)
    }
  }

  return { isCopiedLink, isCopiedMarkdown, handleCopyLink, handleCopyMarkdown }
}

function isImageOf(file: AttachmentWithUsage): boolean {
  return getFileCategory(file.mime, file.filename) === 'image'
}

function useTagForm(file: AttachmentWithUsage | null, onUpdateTags: (file: AttachmentWithUsage, tags: string[]) => Promise<void>) {
  const [newTagInput, setNewTagInput] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    const trimmed = newTagInput.trim()
    if (!trimmed) {
      setIsAddingTag(false)
      return
    }
    const currentTags = file.tags ?? []
    if (!currentTags.includes(trimmed)) {
      await onUpdateTags(file, [...currentTags, trimmed])
    }
    setNewTagInput('')
    setIsAddingTag(false)
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!file) return
    const currentTags = file.tags ?? []
    await onUpdateTags(file, currentTags.filter((tag) => tag !== tagToRemove))
  }

  return { newTagInput, setNewTagInput, isAddingTag, setIsAddingTag, handleAddTag, handleRemoveTag }
}

export function AttachmentInspector(props: AttachmentInspectorProps) {
  const { file, onClose, onRename, onShowQr, onInsertToNote, onDelete, onUpdateTags, onPreview } = props
  const attachmentFolders = useAttachmentStore((s) => s.folders)
  const openNote = useNotes((s) => s.openNote)
  const { referencingNotes, isLoadingNotes } = useInspectorNotes(file)
  const copy = useCopyActions(file)
  const tags = useTagForm(file, onUpdateTags)

  if (!file) return null

  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(file.mime, file.filename)
  const isImage = category === 'image'
  const badge = getFileBadgeColor(category, ext)
  const folder = file.folderId ? attachmentFolders.find((f) => f.id === file.folderId) : null

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
          {t('attachments.detail_info')}
        </span>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-4">
        <FilePreviewBlock file={file} isImage={isImage} badge={badge} onPreview={onPreview} />
        <FileNameBlock file={file} onRename={onRename} />
        <ActionButtons file={file} copy={copy} onInsertToNote={onInsertToNote} onShowQr={onShowQr} />
        <MetaBlock file={file} folder={folder} />
        <TagsBlock file={file} tags={tags} />
        <ReferencingBlock openNote={openNote} referencingNotes={referencingNotes} isLoadingNotes={isLoadingNotes} />
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <Button size="sm" variant="danger" className="w-full" icon={<Trash2 size={13} />} onClick={() => onDelete(file)}>
            {t('attachments.delete')}
          </Button>
        </div>
      </div>
    </aside>
  )
}

function FilePreviewBlock({ file, isImage, badge, onPreview }: {
  file: AttachmentWithUsage
  isImage: boolean
  badge: { label: string; bg: string; text: string }
  onPreview: (file: AttachmentWithUsage) => void
}) {
  return (
    <div
      onClick={() => onPreview(file)}
      className="group relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-base)]"
    >
      {isImage ? (
        <img src={file.url} alt={file.filename} className="h-full w-full object-cover transition-transform duration-[var(--dur-base)] group-hover:scale-105" />
      ) : (
        <div className={cn('flex flex-col items-center gap-1.5 p-4 rounded-xl', badge.bg)}>
          <span className={cn('text-lg font-bold tracking-wider', badge.text)}>{badge.label}</span>
          <span className="text-[length:var(--text-11)] text-[var(--text-tertiary)]">{file.mime}</span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 size={20} className="text-white" />
      </div>
    </div>
  )
}

function FileNameBlock({ file, onRename }: { file: AttachmentWithUsage; onRename: (file: AttachmentWithUsage) => void }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] break-all">
          {file.filename}
        </h4>
        <IconButton label={t('attachments.rename')} size="sm" onClick={() => onRename(file)}>
          <Pencil size={12} />
        </IconButton>
      </div>
      <p className="mt-1 text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)]">
        {formatFileSize(file.size)}
        {file.width && file.height ? ` · ${file.width} × ${file.height}` : ''}
      </p>
    </div>
  )
}

function ActionButtons({ file, copy, onInsertToNote, onShowQr }: {
  file: AttachmentWithUsage
  copy: ReturnType<typeof useCopyActions>
  onInsertToNote?: (file: AttachmentWithUsage) => void
  onShowQr: (file: AttachmentWithUsage) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 pt-1">
      {onInsertToNote && (
        <Button size="sm" variant="secondary" className="col-span-2" icon={<Paperclip size={13} />} onClick={() => onInsertToNote(file)}>
          {t('attachments.insert_into_note')}
        </Button>
      )}
      <Button size="sm" variant="secondary" icon={copy.isCopiedMarkdown ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />} onClick={() => void copy.handleCopyMarkdown()}>
        {copy.isCopiedMarkdown ? t('common.copied') : t('attachments.copy_markdown')}
      </Button>
      <Button size="sm" variant="secondary" icon={copy.isCopiedLink ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />} onClick={() => void copy.handleCopyLink()}>
        {copy.isCopiedLink ? t('common.copied') : t('attachments.copy_link')}
      </Button>
      <Button size="sm" variant="secondary" icon={<QrCode size={13} />} onClick={() => onShowQr(file)}>
        {t('attachments.qr_code_title')}
      </Button>
      <a
        href={file.url}
        download={file.filename}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <Download size={13} />
        <span>{t('common.download')}</span>
      </a>
    </div>
  )
}

function MetaBlock({ file, folder }: { file: AttachmentWithUsage; folder: { name: string } | null | undefined }) {
  return (
    <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3 text-[length:var(--text-12)]">
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
  )
}

function TagsBlock({ file, tags }: { file: AttachmentWithUsage; tags: ReturnType<typeof useTagForm> }) {
  return (
    <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]">
          {t('navigation.tag')}
        </span>
        <IconButton label={t('attachments.add_tag')} size="sm" onClick={() => tags.setIsAddingTag(true)}>
          <Plus size={12} />
        </IconButton>
      </div>

      <div className="flex flex-wrap gap-1">
        {file.tags?.map((tName) => (
          <span key={tName} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-[length:var(--text-11)] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            <span>#{tName}</span>
            <button type="button" onClick={() => void tags.handleRemoveTag(tName)} className="rounded-full text-[var(--text-quaternary)] hover:text-[var(--text-primary)]">
              <X size={10} />
            </button>
          </span>
        ))}

        {tags.isAddingTag && (
          <form onSubmit={tags.handleAddTag} className="inline-flex">
            <input
              autoFocus
              value={tags.newTagInput}
              onChange={(e) => tags.setNewTagInput(e.target.value)}
              onBlur={() => {
                if (!tags.newTagInput.trim()) tags.setIsAddingTag(false)
              }}
              placeholder={t('attachments.add_tag')}
              className="h-6 w-24 rounded-full border border-[var(--accent)] bg-[var(--bg-base)] px-2 text-[length:var(--text-11)] outline-none"
            />
          </form>
        )}
      </div>
    </div>
  )
}

function ReferencingBlock({ openNote, referencingNotes, isLoadingNotes }: {
  openNote: (noteId: string) => void
  referencingNotes: ReferencingNote[]
  isLoadingNotes: boolean
}) {
  return (
    <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
      <span className="text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]">
        {t('attachments.referencing_notes')}
      </span>

      {isLoadingNotes ? (
        <p className="text-[length:var(--text-11\\.5)] text-[var(--text-quaternary)]">{t('common.loading')}</p>
      ) : referencingNotes.length === 0 ? (
        <p className="text-[length:var(--text-11\\.5)] text-[var(--text-quaternary)]">
          {t('attachments.no_referencing_notes')}
        </p>
      ) : (
        <div className="space-y-1">
          {referencingNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => openNote(note.id)}
              className="flex w-full items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <FileText size={13} className="shrink-0 text-[var(--text-quaternary)]" />
              <span className="truncate">{note.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}