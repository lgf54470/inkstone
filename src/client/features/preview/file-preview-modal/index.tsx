import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Eye, FileCode, FileSpreadsheet, FileText, Loader2, Music, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { COPY_FEEDBACK_MS } from '@shared/constants';
import { Modal } from '../../../components/overlay';
import { IconButton } from '../../../components/primitives';
import { t } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';
import { errorMessage } from '../../../lib/errors';
import { renderMarkdown } from '../../../lib/markdown/renderer';
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MARKDOWN_EXTENSIONS, CSV_EXTENSIONS, CODE_EXTENSIONS, TEXT_DATA_EXTENSIONS } from './extensions';
import { getExtension, parseCsvToRows } from './utils';
import { CodeViewer } from './code-viewer';
import type { FilePreviewModalProps } from './types';

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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const [textMode, setTextMode] = useState<'rendered' | 'source' | 'table'>('rendered')

  const [imageScale, setImageScale] = useState(1)
  const [imageRotation, setImageRotation] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(true)
  const [isImageError, setIsImageError] = useState(false)

  useEffect(() => {
    if (!open) {
      setImageScale(1)
      setImageRotation(0)
      setNaturalSize(null)
      setIsImageLoading(true)
      setIsImageError(false)
      setTextContent(null)
      setError(null)
      setIsLoading(false)
      setTextMode('rendered')
      return
    }

    if (isImage) {
      setIsImageLoading(true)
      setIsImageError(false)
      setImageScale(1)
      setImageRotation(0)
    }

    if (!isText) return

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const text = await res.text()
        setTextContent(text)
        setIsLoading(false)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(errorMessage(err))
        setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, url, isText, isImage])

  const previewUrl = `${url}?preview=1`

  const handleCopyText = async () => {
    if (!textContent) return
    try {
      await navigator.clipboard.writeText(textContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS)
    } catch (error) {
      console.warn('[preview] failed to copy text', error)
    }
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
            <span className="shrink-0 rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[length:var(--text-11)] font-mono text-[var(--text-tertiary)]">
              {`${naturalSize.width} × ${naturalSize.height} px`}
            </span>
          )}
        </div>
      }
      width={modalWidth}
      className="max-h-[82vh] flex flex-col"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ExternalLink size={13} />
              <span>{t('preview.open_in_new_tab')}</span>
            </a>
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] transition-transform active:translate-y-px cursor-pointer"
            >
              <Download size={13} />
              <span>{t('workspace.download_file')}</span>
            </a>

            {isText && textContent !== null && (
              <button
                type="button"
                onClick={() => void handleCopyText()}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                {isCopied ? <Check size={13} className="text-[var(--accent)]" /> : <Copy size={13} />}
                <span>{isCopied ? t('common.copied') : t('common.copy')}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-[var(--r-md)] px-3 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className={cn('min-h-[280px] flex flex-col', isText || isMarkdown ? 'justify-start' : 'justify-center')}>
        {isImage && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 py-0.5 text-[length:var(--text-12)]">
              <div className="flex items-center gap-1 bg-[var(--bg-sunken)] p-0.5 rounded-[var(--r-md)] border border-[var(--border-subtle)]">
                <IconButton label={t('preview.zoom_out')} size="sm" onClick={handleZoomOut} disabled={imageScale <= 0.25}>
                  <ZoomOut size={13} />
                </IconButton>
                <span className="px-1.5 font-mono text-[length:var(--text-11)] min-w-[42px] text-center text-[var(--text-secondary)]">
                  {Math.round(imageScale * 100)}%
                </span>
                <IconButton label={t('preview.zoom_in')} size="sm" onClick={handleZoomIn} disabled={imageScale >= 3}>
                  <ZoomIn size={13} />
                </IconButton>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="px-2 py-0.5 text-[length:var(--text-11)] font-medium rounded text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                >
                  {t('preview.zoom_reset')}
                </button>
              </div>

              <IconButton label={t('preview.rotate')} size="sm" onClick={handleRotate}>
                <RotateCw size={13} />
              </IconButton>
            </div>

            <div className="relative flex items-center justify-center min-h-[300px] max-h-[60vh] overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]/40 p-4">
              {isImageLoading && !isImageError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)]/60 backdrop-blur-xs z-[var(--z-sticky)]">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                </div>
              )}

              {isImageError ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-[var(--danger)] text-[length:var(--text-13)]">
                  <p>{t('preview.could_not_load_image')}</p>
                </div>
              ) : (
                <img
                  src={previewUrl}
                  alt={filename}
                  onLoad={(e) => {
                    setIsImageLoading(false)
                    setNaturalSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }}
                  onError={() => {
                    setIsImageLoading(false)
                    setIsImageError(true)
                  }}
                  style={{
                    transform: `scale(${imageScale}) rotate(${imageRotation}deg)`,
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="max-h-[56vh] max-w-full object-contain rounded-[var(--r-md)] shadow-sm select-none"
                />
              )}
            </div>
          </div>
        )}

        {isPdf && (
          <iframe
            src={previewUrl}
            title={filename}
            className="w-full h-[62vh] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-white shadow-xs"
          />
        )}

        {isAudio && (
          <div className="py-16 flex flex-col items-center justify-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm">
              <Music size={36} />
            </div>
            <div className="text-center">
              <h4 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">{filename}</h4>
              <p className="text-[length:var(--text-12)] text-[var(--text-tertiary)] uppercase mt-0.5">{ext}</p>
            </div>
            <audio controls src={previewUrl} className="w-full max-w-md shadow-xs" autoPlay={false} />
          </div>
        )}

        {isVideo && (
          <div className="flex items-center justify-center rounded-[var(--r-lg)] bg-black overflow-hidden shadow-xs">
            <video controls src={previewUrl} className="max-h-[60vh] w-full" autoPlay={false} />
          </div>
        )}

        {isText && (
          <div className="space-y-3">
            {(isMarkdown || isCsv) && !isLoading && !error && textContent !== null && (
              <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
                <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[length:var(--text-11)] font-medium">
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

            {isLoading && (
              <div className="py-20 flex items-center justify-center text-[var(--text-tertiary)] gap-2">
                <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
                <span className="text-[length:var(--text-13)]">{t('preview.loading')}</span>
              </div>
            )}

            {error && (
              <div className="py-12 text-center text-[var(--danger)] text-[length:var(--text-13)]">
                {error}
              </div>
            )}

            {!isLoading && !error && textContent !== null && (
              <>
                {isMarkdown && textMode === 'rendered' ? (
                  <div
                    className="p-5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] prose dark:prose-invert max-w-none text-[length:var(--text-13\.5)] leading-relaxed select-text"
                    dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                  />
                ) : isCsv && (textMode === 'table' || textMode === 'rendered') ? (
                  <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
                    <table className="w-full text-left text-[length:var(--text-12)] border-collapse">
                      {csvRows.length > 0 && (
                        <thead className="sticky top-0 bg-[var(--bg-sunken)] text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
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
                              <td key={cIdx} className="px-3 py-1.5 border-r border-[var(--border-subtle)] last:border-r-0 text-[length:var(--text-12)] select-text">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <CodeViewer code={textContent} ext={ext} />
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
            <h4 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">{filename}</h4>
            <p className="text-[length:var(--text-13)] text-[var(--text-secondary)] max-w-sm">
              {t('preview.file_preview_unsupported')}
            </p>
            <a
              href={url}
              download={filename}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] shadow-xs transition-transform active:translate-y-px cursor-pointer"
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
