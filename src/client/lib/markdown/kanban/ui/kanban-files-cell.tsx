import { createContext, useContext, useRef, useState } from 'react'
import { File as FileIcon, FileText, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { confirm } from '../../../../components/overlay'
import { LIMITS } from '@shared/constants'
import { t } from '../../../i18n'
import { deleteKanbanFile, uploadKanbanFile } from '../../../api'
import { useUi } from '../../../../store/ui'
import { kanbanFileLocation } from '../url'
import type { KanbanFile } from '../types'
import { KanbanFilePreviewModal } from './kanban-file-preview-modal'

// Which bucket new uploads land in. Deletions ignore it and address each file's
// own stored location, so files uploaded before a namespace change still clear.
export const KanbanFilesScope = createContext('default')

interface KanbanFilesCellProps {
  files?: KanbanFile[]
  readonly?: boolean
  onChangeFiles?: (nextFiles: KanbanFile[]) => void
}

function resolveFileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon size={13} className='text-[var(--accent)]' />
  if (mime === 'application/pdf') return <FileText size={13} className='text-[var(--danger)]' />
  return <FileIcon size={13} className='text-[var(--text-tertiary)]' />
}

function FileItemRow({
  file,
  readonly,
  onPreview,
  onDelete,
}: {
  file: KanbanFile
  readonly?: boolean
  onPreview: () => void
  onDelete: () => void
}) {
  return (
    <div className='group/file flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[length:var(--text-11)]'>
      {resolveFileIcon(file.mime)}
      <button
        type='button'
        onClick={onPreview}
        title={file.name}
        className='max-w-32 truncate text-left font-medium text-[var(--text-primary)] hover:underline'
      >
        {file.name}
      </button>
      <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
        {`${(file.size / 1024).toFixed(0)}K`}
      </span>
      {!readonly && (
        <button
          type='button'
          onClick={onDelete}
          title={t('preview.kanban_delete_file')}
          className='ml-auto opacity-0 transition-opacity p-0.5 text-[var(--text-tertiary)] hover:text-[var(--danger)] group-hover/file:opacity-100 focus-visible:opacity-100'
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

/**
 * The split happens before a single byte is sent, against the limit the server enforces
 * (`LIMITS.attachmentMaxBytes`): the same number on both sides, so an over-limit file is refused here
 * instead of after a 25 MB round trip. The server still checks it — this is a courtesy, that is the
 * trust boundary. A file exactly at the limit fits (the server refuses only what is greater).
 */
function splitByUploadLimit(chosen: File[]): { accepted: File[]; tooLarge: File[] } {
  return {
    accepted: chosen.filter((file) => file.size <= LIMITS.attachmentMaxBytes),
    tooLarge: chosen.filter((file) => file.size > LIMITS.attachmentMaxBytes),
  }
}

function reportTooLarge(tooLarge: File[]): void {
  useUi.getState().toast({
    title: t('preview.kanban_file_too_large', {
      value1: String(LIMITS.attachmentMaxBytes / (1024 * 1024)),
    }),
    description: tooLarge.map((file) => file.name).join(', '),
    tone: 'danger',
  })
}

function FileUploadButton({
  kanbanName,
  files,
  onChangeFiles,
}: {
  kanbanName: string
  files: KanbanFile[]
  onChangeFiles?: (next: KanbanFile[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    try {
      const { accepted, tooLarge } = splitByUploadLimit(Array.from(fileList))
      const uploaded: KanbanFile[] = []
      for (const file of accepted) {
        const result = await uploadKanbanFile(file, kanbanName)
        uploaded.push(result)
      }
      if (uploaded.length > 0) onChangeFiles?.([...files, ...uploaded])
      if (tooLarge.length > 0) reportTooLarge(tooLarge)
    } catch (err: unknown) {
      console.error('[kanban] file upload failed', err)
      useUi.getState().toast({
        title: t('preview.kanban_file_upload_failed'),
        tone: 'danger',
      })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type='file' multiple onChange={handleUpload} aria-label={t('preview.kanban_upload_file')} className='hidden' />
      <button
        type='button'
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        title={t('preview.kanban_upload_file')}
        className='flex items-center gap-1 rounded-[var(--r-sm)] border border-dashed border-[var(--border-default)] px-2 py-1 text-[length:var(--text-11)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]'
      >
        {uploading ? <Loader2 size={12} className='animate-spin' /> : <Plus size={12} />}
        <span>{t('preview.kanban_upload_file')}</span>
      </button>
    </>
  )
}

export function KanbanFilesCell({
  files = [],
  readonly = false,
  onChangeFiles,
}: KanbanFilesCellProps) {
  const [previewFile, setPreviewFile] = useState<KanbanFile | null>(null)
  const kanbanName = useContext(KanbanFilesScope)

  // A stored file leaves the bucket for good, so it asks first — the reference in the note is
  // undoable, the bytes are not. A file hosted elsewhere has nothing here to delete.
  const handleDelete = async (file: KanbanFile) => {
    const location = kanbanFileLocation(file)
    if (location && !(await confirm({
      title: t('preview.kanban_delete_file_value0', { value0: file.name }),
      description: t('preview.kanban_delete_file_confirm_description'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    }))) return

    onChangeFiles?.(files.filter((f) => f.id !== file.id))
    if (!location) return
    try {
      await deleteKanbanFile(location.kanbanName, location.filename)
      useUi.getState().toast({ title: t('preview.kanban_file_deleted'), tone: 'success' })
    } catch (err: unknown) {
      console.error('[kanban] file delete failed', err)
      onChangeFiles?.(files)
      useUi.getState().toast({
        title: t('preview.kanban_file_delete_failed'),
        tone: 'danger',
      })
    }
  }

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {files.map((file) => (
        <FileItemRow
          key={file.id}
          file={file}
          readonly={readonly}
          onPreview={() => setPreviewFile(file)}
          onDelete={() => { void handleDelete(file) }}
        />
      ))}

      {!readonly && (
        <FileUploadButton kanbanName={kanbanName} files={files} onChangeFiles={onChangeFiles} />
      )}

      <KanbanFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  )
}
