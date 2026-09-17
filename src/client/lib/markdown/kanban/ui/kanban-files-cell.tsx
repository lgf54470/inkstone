import { useRef, useState } from 'react'
import { File as FileIcon, FileText, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { t } from '../../../i18n'
import { uploadKanbanFile } from '../../../api'
import { useUi } from '../../../../store/ui'
import type { KanbanFile } from '../types'
import { KanbanFilePreviewModal } from './kanban-file-preview-modal'

interface KanbanFilesCellProps {
  files?: KanbanFile[]
  kanbanName?: string
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
          className='ml-auto opacity-0 transition-opacity p-0.5 text-[var(--text-tertiary)] hover:text-[var(--danger)] group-hover/file:opacity-100'
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
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
      const uploaded: KanbanFile[] = []
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]!
        const result = await uploadKanbanFile(f, kanbanName)
        uploaded.push(result)
      }
      onChangeFiles?.([...files, ...uploaded])
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
      <input ref={inputRef} type='file' multiple onChange={handleUpload} className='hidden' />
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
  kanbanName = 'default',
  readonly = false,
  onChangeFiles,
}: KanbanFilesCellProps) {
  const [previewFile, setPreviewFile] = useState<KanbanFile | null>(null)

  const handleDelete = (id: string) => {
    onChangeFiles?.(files.filter((f) => f.id !== id))
  }

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {files.map((file) => (
        <FileItemRow
          key={file.id}
          file={file}
          readonly={readonly}
          onPreview={() => setPreviewFile(file)}
          onDelete={() => handleDelete(file.id)}
        />
      ))}

      {!readonly && (
        <FileUploadButton kanbanName={kanbanName} files={files} onChangeFiles={onChangeFiles} />
      )}

      <KanbanFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  )
}
