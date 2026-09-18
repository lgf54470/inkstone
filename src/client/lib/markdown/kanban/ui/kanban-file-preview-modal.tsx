import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import type { KanbanFile } from '../types'

const PREVIEW_MODAL_WIDTH = 768

function isPdfFile(file: KanbanFile): boolean {
  return file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function isTextFile(file: KanbanFile): boolean {
  return (
    file.mime.startsWith('text/') ||
    file.name.toLowerCase().endsWith('.txt') ||
    file.name.toLowerCase().endsWith('.md') ||
    file.name.toLowerCase().endsWith('.json') ||
    file.name.toLowerCase().endsWith('.csv')
  )
}

function TextFilePreview({ url }: { url: string }) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        if (active) {
          setContent(text)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [url])

  if (loading) {
    return (
      <div className='flex h-32 items-center justify-center text-[var(--text-tertiary)]'>
        <Loader2 size={16} className='animate-spin' />
      </div>
    )
  }

  return (
    <div className='max-h-[65vh] overflow-auto p-4'>
      <pre className='whitespace-pre-wrap break-words rounded-[var(--r-md)] bg-[var(--bg-inset)] p-3 text-[length:var(--text-12)] font-mono text-[var(--text-primary)]'>
        {content}
      </pre>
    </div>
  )
}

// CSP sets `object-src 'none'` and `frame-src 'none'`, so any embedded PDF
// document is guaranteed blank; offer the file as an explicit new-tab action.
function fileMetaLabel(file: KanbanFile): string {
  return `${(file.size / 1024).toFixed(1)} KB · ${file.mime}`
}

function PdfPreview({ file }: { file: KanbanFile }) {
  return (
    <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
      <FileText size={28} className='text-[var(--text-tertiary)]' />
      <div className='text-[length:var(--text-14)] font-medium text-[var(--text-primary)]'>{file.name}</div>
      <div className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{fileMetaLabel(file)}</div>
      <a
        href={file.url}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 py-1.5 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]'
      >
        <ExternalLink size={13} />
        <span>{t('preview.open_in_new_tab')}</span>
      </a>
    </div>
  )
}

function PreviewContent({ file }: { file: KanbanFile }) {
  if (file.mime.startsWith('image/')) {
    return (
      <div className='flex max-h-[70vh] items-center justify-center overflow-auto p-4'>
        <img src={file.url} alt={file.name} className='max-h-[65vh] max-w-full rounded-[var(--r-md)] object-contain' />
      </div>
    )
  }

  if (isPdfFile(file)) {
    return <PdfPreview file={file} />
  }

  if (isTextFile(file)) {
    return <TextFilePreview url={file.url} />
  }

  return (
    <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
      <div className='text-[length:var(--text-14)] font-medium text-[var(--text-primary)]'>{file.name}</div>
      <div className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {fileMetaLabel(file)}
      </div>
    </div>
  )
}

interface KanbanFilePreviewModalProps {
  file: KanbanFile | null
  onClose: () => void
}

export function KanbanFilePreviewModal({ file, onClose }: KanbanFilePreviewModalProps) {
  if (!file) return null

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={file.name}
      width={PREVIEW_MODAL_WIDTH}
      footer={
        <div className='flex w-full items-center justify-between'>
          <a
            href={file.url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-[length:var(--text-12)] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]'
          >
            <ExternalLink size={14} />
            <span>{t('preview.open_in_new_tab')}</span>
          </a>
          <a
            href={file.url}
            download={file.name}
            className='inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 py-1.5 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] transition-opacity hover:opacity-90'
          >
            <Download size={14} />
            <span>{t('preview.kanban_download_file')}</span>
          </a>
        </div>
      }
    >
      <PreviewContent file={file} />
    </Modal>
  )
}
