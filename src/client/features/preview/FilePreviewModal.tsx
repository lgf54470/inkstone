import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'

export interface FilePreviewModalProps {
  open: boolean
  onClose: () => void
  url: string
  filename: string
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function FilePreviewModal({ open, onClose, url, filename }: FilePreviewModalProps) {
  const ext = getExtension(filename)
  const isPdf = ext === 'pdf'
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)
  const isText = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'sh', 'yaml', 'yml', 'xml', 'sql'].includes(ext)

  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !isText) {
      setTextContent(null)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.text()
      })
      .then((text) => {
        setTextContent(text)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [open, url, isText])

  const previewUrl = `${url}?preview=1`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={filename}
      width={isPdf ? 920 : 760}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <ExternalLink size={13} />
              <span>{t('preview.open_in_new_tab')}</span>
            </a>
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-contrast)] transition-transform active:translate-y-px"
            >
              <Download size={13} />
              <span>{t('workspace.download_file')}</span>
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-[var(--r-md)] px-3 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="min-h-[260px] flex flex-col justify-center">
        {isPdf && (
          <iframe
            src={previewUrl}
            title={filename}
            className="w-full h-[68vh] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-white"
          />
        )}

        {isAudio && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <audio controls src={previewUrl} className="w-full max-w-md" />
          </div>
        )}

        {isVideo && (
          <div className="flex items-center justify-center">
            <video controls src={previewUrl} className="max-h-[65vh] w-full rounded-[var(--r-md)] bg-black" />
          </div>
        )}

        {isText && (
          <div>
            {loading && (
              <div className="py-16 flex items-center justify-center text-[var(--text-tertiary)] gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[13px]">{t('preview.loading')}</span>
              </div>
            )}
            {error && (
              <div className="py-12 text-center text-[var(--danger)] text-[13px]">
                {error}
              </div>
            )}
            {!loading && !error && textContent !== null && (
              <pre className="max-h-[65vh] overflow-auto p-4 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] font-mono text-[12.5px] leading-relaxed select-text whitespace-pre-wrap break-words">
                <code>{textContent}</code>
              </pre>
            )}
          </div>
        )}

        {!isPdf && !isAudio && !isVideo && !isText && (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="size-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-tertiary)]">
              <FileText size={24} />
            </div>
            <p className="text-[13px] text-[var(--text-secondary)]">
              {t('preview.file_preview_unsupported')}
            </p>
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3.5 text-[12px] font-medium text-[var(--accent-contrast)]"
            >
              <Download size={13} />
              <span>{t('workspace.download_file')}</span>
            </a>
          </div>
        )}
      </div>
    </Modal>
  )
}
