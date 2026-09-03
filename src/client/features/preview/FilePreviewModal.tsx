import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileSpreadsheet,
  FileText,
  Loader2,
  Music,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { cn } from '../../lib/cn'
import { renderMarkdown } from '../../lib/markdown/renderer'

export interface FilePreviewModalProps {
  open: boolean
  onClose: () => void
  url: string
  filename: string
}

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
  'tiff',
  'tif',
  'apng',
])

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'wma',
  'opus',
  'weba',
  'mid',
  'midi',
])

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  'ogv',
  'avi',
  'mkv',
  '3gp',
])

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd'])

const CSV_EXTENSIONS = new Set(['csv', 'tsv'])

const CODE_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'py',
  'pyw',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'cc',
  'cxx',
  'h',
  'hpp',
  'cs',
  'swift',
  'kt',
  'kts',
  'php',
  'rb',
  'lua',
  'r',
  'dart',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'bat',
  'cmd',
  'ps1',
  'proto',
  'graphql',
  'gql',
  'diff',
  'patch',
  'dockerfile',
  'makefile',
  'gitignore',
])

const TEXT_DATA_EXTENSIONS = new Set([
  'txt',
  'text',
  'log',
  'rtf',
  'json',
  'jsonc',
  'json5',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'env',
  'properties',
])

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function parseCsvToRows(text: string, delimiter = ','): string[][] {
  const lines = text.trim().split(/\r?\n/)
  return lines.slice(0, 100).map((line) => {
    const row: string[] = []
    let inQuotes = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    row.push(current.trim())
    return row
  })
}

export function FilePreviewModal({ open, onClose, url, filename }: FilePreviewModalProps) {
  const ext = getExtension(filename)
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const isPdf = ext === 'pdf'
  const isAudio = AUDIO_EXTENSIONS.has(ext)
  const isVideo = VIDEO_EXTENSIONS.has(ext)
  const isMarkdown = MARKDOWN_EXTENSIONS.has(ext)
  const isCsv = CSV_EXTENSIONS.has(ext)
  const isCode = CODE_EXTENSIONS.has(ext)
  const isTextData = TEXT_DATA_EXTENSIONS.has(ext)
  const isText = isMarkdown || isCsv || isCode || isTextData

  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [textMode, setTextMode] = useState<'rendered' | 'source' | 'table'>('rendered')

  const [imageScale, setImageScale] = useState(1)
  const [imageRotation, setImageRotation] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [imageLoading, setImageLoading] = useState(true)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!open) {
      setImageScale(1)
      setImageRotation(0)
      setNaturalSize(null)
      setImageLoading(true)
      setImageError(false)
      setTextContent(null)
      setError(null)
      setLoading(false)
      setTextMode('rendered')
      return
    }

    if (isImage) {
      setImageLoading(true)
      setImageError(false)
      setImageScale(1)
      setImageRotation(0)
    }

    if (!isText) return

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
  }, [open, url, isText, isImage])

  const previewUrl = `${url}?preview=1`

  const handleCopyText = async () => {
    if (!textContent) return
    try {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const renderedMarkdown = useMemo(() => {
    if (!isMarkdown || !textContent) return ''
    try {
      return renderMarkdown(textContent, { externalImages: true }).html
    } catch {
      return ''
    }
  }, [isMarkdown, textContent])

  const csvRows = useMemo(() => {
    if (!isCsv || !textContent) return []
    return parseCsvToRows(textContent, ext === 'tsv' ? '\t' : ',')
  }, [isCsv, textContent, ext])

  const modalWidth = isPdf || isImage || isVideo ? 1040 : isMarkdown ? 920 : isText ? 860 : isAudio ? 580 : 640

  const handleZoomIn = () => setImageScale((prev) => Math.min(prev + 0.25, 3))
  const handleZoomOut = () => setImageScale((prev) => Math.max(prev - 0.25, 0.25))
  const handleZoomReset = () => {
    setImageScale(1)
    setImageRotation(0)
  }
  const handleRotate = () => setImageRotation((prev) => (prev + 90) % 360)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 max-w-[700px] truncate">
          <span className="truncate font-semibold">{filename}</span>
          {isImage && naturalSize && (
            <span className="shrink-0 rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--text-tertiary)]">
              {`${naturalSize.width} × ${naturalSize.height} px`}
            </span>
          )}
        </div>
      }
      width={modalWidth}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ExternalLink size={13} />
              <span>{t('preview.open_in_new_tab')}</span>
            </a>
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-contrast)] transition-transform active:translate-y-px cursor-pointer"
            >
              <Download size={13} />
              <span>{t('workspace.download_file')}</span>
            </a>

            {isText && textContent !== null && (
              <button
                type="button"
                onClick={() => void handleCopyText()}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                {copied ? <Check size={13} className="text-[var(--accent)]" /> : <Copy size={13} />}
                <span>{copied ? t('common.copied') : t('common.copy')}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-[var(--r-md)] px-3 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="min-h-[280px] flex flex-col justify-center">
        {isImage && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 py-0.5 text-[12px]">
              <div className="flex items-center gap-1 bg-[var(--bg-sunken)] p-0.5 rounded-[var(--r-md)] border border-[var(--border-subtle)]">
                <IconButton label={t('preview.zoom_out')} size="sm" onClick={handleZoomOut} disabled={imageScale <= 0.25}>
                  <ZoomOut size={13} />
                </IconButton>
                <span className="px-1.5 font-mono text-[11px] min-w-[42px] text-center text-[var(--text-secondary)]">
                  {Math.round(imageScale * 100)}%
                </span>
                <IconButton label={t('preview.zoom_in')} size="sm" onClick={handleZoomIn} disabled={imageScale >= 3}>
                  <ZoomIn size={13} />
                </IconButton>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="px-2 py-0.5 text-[11px] font-medium rounded text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                >
                  {t('preview.zoom_reset')}
                </button>
              </div>

              <IconButton label={t('preview.rotate')} size="sm" onClick={handleRotate}>
                <RotateCw size={13} />
              </IconButton>
            </div>

            <div className="relative flex items-center justify-center min-h-[420px] max-h-[72vh] overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]/40 p-4">
              {imageLoading && !imageError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)]/60 backdrop-blur-xs z-10">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                </div>
              )}

              {imageError ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-[var(--danger)] text-[13px]">
                  <p>{t('preview.could_not_load_image')}</p>
                </div>
              ) : (
                <img
                  src={previewUrl}
                  alt={filename}
                  onLoad={(e) => {
                    setImageLoading(false)
                    setNaturalSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }}
                  onError={() => {
                    setImageLoading(false)
                    setImageError(true)
                  }}
                  style={{
                    transform: `scale(${imageScale}) rotate(${imageRotation}deg)`,
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="max-h-[68vh] max-w-full object-contain rounded-[var(--r-md)] shadow-sm select-none"
                />
              )}
            </div>
          </div>
        )}

        {isPdf && (
          <iframe
            src={previewUrl}
            title={filename}
            className="w-full h-[72vh] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-white shadow-xs"
          />
        )}

        {isAudio && (
          <div className="py-16 flex flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm">
              <Music size={36} />
            </div>
            <div className="text-center">
              <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{filename}</h4>
              <p className="text-[12px] text-[var(--text-tertiary)] uppercase mt-0.5">{ext}</p>
            </div>
            <audio controls src={previewUrl} className="w-full max-w-md shadow-xs" autoPlay={false} />
          </div>
        )}

        {isVideo && (
          <div className="flex items-center justify-center rounded-[var(--r-lg)] bg-black overflow-hidden shadow-xs">
            <video controls src={previewUrl} className="max-h-[70vh] w-full" autoPlay={false} />
          </div>
        )}

        {isText && (
          <div className="space-y-3">
            {(isMarkdown || isCsv) && !loading && !error && textContent !== null && (
              <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
                <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[11px] font-medium">
                  {isMarkdown && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTextMode('rendered')}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer',
                          textMode === 'rendered'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <Eye size={12} />
                        <span>{t('preview.view_rendered')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextMode('source')}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer',
                          textMode === 'source'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <FileCode size={12} />
                        <span>{t('preview.view_source')}</span>
                      </button>
                    </>
                  )}

                  {isCsv && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTextMode('table')}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer',
                          textMode === 'table' || textMode === 'rendered'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <FileSpreadsheet size={12} />
                        <span>{t('preview.view_table')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextMode('source')}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer',
                          textMode === 'source'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs'
                            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <FileCode size={12} />
                        <span>{t('preview.view_source')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {loading && (
              <div className="py-20 flex items-center justify-center text-[var(--text-tertiary)] gap-2">
                <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
                <span className="text-[13px]">{t('preview.loading')}</span>
              </div>
            )}

            {error && (
              <div className="py-12 text-center text-[var(--danger)] text-[13px]">
                {error}
              </div>
            )}

            {!loading && !error && textContent !== null && (
              <>
                {isMarkdown && textMode === 'rendered' ? (
                  <div
                    className="max-h-[68vh] overflow-y-auto p-5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] prose dark:prose-invert max-w-none text-[13.5px] leading-relaxed select-text"
                    dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                  />
                ) : isCsv && (textMode === 'table' || textMode === 'rendered') ? (
                  <div className="max-h-[68vh] overflow-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                    <table className="w-full text-left text-[12px] border-collapse">
                      {csvRows.length > 0 && (
                        <thead className="sticky top-0 bg-[var(--bg-sunken)] text-[11px] font-semibold text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
                          <tr>
                            {csvRows[0]?.map((col, cIdx) => (
                              <th key={cIdx} className="px-3 py-2 border-r border-[var(--border-subtle)] last:border-r-0 whitespace-nowrap">
                                {col || `#${cIdx + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {csvRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[var(--bg-hover)]">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-3 py-1.5 border-r border-[var(--border-subtle)] last:border-r-0 text-[12px] select-text">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-[68vh] overflow-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] font-mono text-[12.5px] leading-relaxed select-text flex">
                    <div className="shrink-0 select-none py-3 px-2 text-right text-[var(--text-quaternary)] border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)]/40 font-mono text-[11px]">
                      {textContent.split('\n').map((_, idx) => (
                        <div key={idx}>{idx + 1}</div>
                      ))}
                    </div>
                    <pre className="p-3 m-0 overflow-x-auto whitespace-pre font-mono text-[12.5px] leading-relaxed flex-1">
                      <code>{textContent}</code>
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!isImage && !isPdf && !isAudio && !isVideo && !isText && (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-sunken)] text-[var(--text-tertiary)] mb-1">
              <FileText size={32} />
            </div>
            <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{filename}</h4>
            <p className="text-[13px] text-[var(--text-secondary)] max-w-sm">
              {t('preview.file_preview_unsupported')}
            </p>
            <a
              href={url}
              download={filename}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-[12px] font-medium text-[var(--accent-contrast)] shadow-xs transition-transform active:translate-y-px cursor-pointer"
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
