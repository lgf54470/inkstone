import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, FileWarning, Loader2 } from 'lucide-react'
import { Button } from '../../../../components/primitives'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { KanbanBlockedImage, useKanbanImageAllowed } from './kanban-image-policy'
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

type ReadState = 'loading' | 'ready' | 'failed'

/**
 * What the reader gets when a read did not produce the document: the reason, and the one action that
 * can still help. Both surfaces below need it, and neither may leave the space blank — a board's
 * attachment can point at an object somebody deleted, and a blank panel reads as "the file is empty"
 * when the truth is "the file is gone".
 */
function ReadFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <div data-kanban-file-failed className='flex h-48 flex-col items-center justify-center gap-2 p-6 text-center'>
      <FileWarning size={24} className='text-[var(--text-tertiary)]' aria-hidden='true' />
      <div className='text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
        {t('preview.kanban_file_load_failed')}
      </div>
      <p className='max-w-[38ch] text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {t('preview.kanban_file_load_failed_hint')}
      </p>
      {onRetry && (
        <Button variant='secondary' size='sm' onClick={onRetry}>
          {t('preview.kanban_file_retry')}
        </Button>
      )}
    </div>
  )
}

/**
 * The read itself, kept out of the component so the failure path stays one place: a stored object
 * that is gone answers 404 with a body, and reading that body as the file would print the server's
 * error page into the panel and call it the document.
 */
function useKanbanTextRead(url: string): { state: ReadState; content: string; retry: () => void } {
  const [content, setContent] = useState<string>('')
  const [state, setState] = useState<ReadState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState('loading')
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`kanban file read failed: HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        if (!active) return
        setContent(text)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setState('failed')
        console.warn('[inkstone] kanban file preview failed', url, error)
      })
    return () => {
      active = false
    }
  }, [url, attempt])

  return { state, content, retry: () => setAttempt((current) => current + 1) }
}

function TextFilePreview({ url }: { url: string }) {
  const { state, content, retry } = useKanbanTextRead(url)

  if (state === 'loading') {
    return (
      <div className='flex h-32 items-center justify-center text-[var(--text-tertiary)]'>
        <Loader2 size={16} className='animate-spin' />
      </div>
    )
  }

  if (state === 'failed') {
    return <ReadFailed onRetry={retry} />
  }

  if (content.trim() === '') {
    return (
      <div className='flex h-32 items-center justify-center text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {t('preview.kanban_file_empty')}
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

/**
 * An image the reader is allowed to load, which the browser may still fail to fetch — the note can
 * name a file whose object was deleted, which is exactly the state a restored undo leaves behind.
 * Keyed by URL at the call site, so opening another attachment clears the failure instead of showing
 * one file's error over another file's name.
 */
function ImagePreview({ file }: { file: KanbanFile }) {
  const [failed, setFailed] = useState(false)

  if (failed) return <ReadFailed />

  return (
    <div className='flex max-h-[70vh] items-center justify-center overflow-auto p-4'>
      <img
        src={file.url}
        alt={file.name}
        referrerPolicy='no-referrer'
        onError={() => setFailed(true)}
        className='max-h-[65vh] max-w-full rounded-[var(--r-md)] object-contain'
      />
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
  const isImage = file.mime.startsWith('image/')
  const imageAllowed = useKanbanImageAllowed(isImage ? file.url : '')

  if (isImage && !imageAllowed) {
    return <KanbanBlockedImage className='h-64 w-full rounded-[var(--r-md)]' />
  }

  if (isImage) {
    return <ImagePreview key={file.url} file={file} />
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
