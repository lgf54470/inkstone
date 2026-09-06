import { Check, Copy, Download, Eye, FileCode, FileSpreadsheet, FileText, Loader2, Music, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '../../../components/primitives'
import { t } from '../../../lib/i18n'
import { cn } from '../../../lib/cn'
import { CodeViewer } from './code-viewer'
import type { FilePreviewBundle } from './use-file-preview-modal'

export function CopyTextButton({ bundle }: { bundle: FilePreviewBundle }) {
  const { isCopied, handleCopyText } = bundle
  return (
    <button
      type="button"
      onClick={() => void handleCopyText()}
      className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
    >
      {isCopied ? <Check size={13} className="text-[var(--accent)]" /> : <Copy size={13} />}
      <span>{isCopied ? t('common.copied') : t('common.copy')}</span>
    </button>
  )
}

function ZoomControls({ bundle }: { bundle: FilePreviewBundle }) {
  const { imageScale, handleZoomIn, handleZoomOut, handleZoomReset } = bundle
  return (
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
  )
}

export function ImagePreview({ bundle }: { bundle: FilePreviewBundle }) {
  const { filename, previewUrl, imageScale, imageRotation, isImageLoading, isImageError, setNaturalSize, setIsImageLoading, setIsImageError, handleRotate } = bundle
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 py-0.5 text-[length:var(--text-12)]">
        <ZoomControls bundle={bundle} />
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
              setNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
            }}
            onError={() => {
              setIsImageLoading(false)
              setIsImageError(true)
            }}
            style={{ transform: `scale(${imageScale}) rotate(${imageRotation}deg)`, transition: 'transform 0.15s ease-out' }}
            className="max-h-[56vh] max-w-full object-contain rounded-[var(--r-md)] shadow-sm select-none"
          />
        )}
      </div>
    </div>
  )
}

export function MediaPreview({ bundle }: { bundle: FilePreviewBundle }) {
  const { filename, ext, previewUrl, isPdf, isVideo } = bundle
  if (isPdf) {
    return <iframe src={previewUrl} title={filename} className="w-full h-[62vh] rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-white shadow-xs" />
  }
  if (isVideo) {
    return (
      <div className="flex items-center justify-center rounded-[var(--r-lg)] bg-black overflow-hidden shadow-xs">
        <video controls src={previewUrl} className="max-h-[60vh] w-full" autoPlay={false} />
      </div>
    )
  }
  return (
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
  )
}

export function UnsupportedPreview({ bundle }: { bundle: FilePreviewBundle }) {
  const { filename, url } = bundle
  return (
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
  )
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer',
        active ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-xs' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function ModeTabs({ bundle }: { bundle: FilePreviewBundle }) {
  const { isMarkdown, isCsv, textMode, setTextMode } = bundle
  return (
    <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
      <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5 text-[length:var(--text-11)] font-medium">
        {isMarkdown && (
          <>
            <ModeTab active={textMode === 'rendered'} onClick={() => setTextMode('rendered')} icon={<Eye size={12} />} label={t('preview.view_rendered')} />
            <ModeTab active={textMode === 'source'} onClick={() => setTextMode('source')} icon={<FileCode size={12} />} label={t('preview.view_source')} />
          </>
        )}
        {isCsv && (
          <>
            <ModeTab active={textMode === 'table' || textMode === 'rendered'} onClick={() => setTextMode('table')} icon={<FileSpreadsheet size={12} />} label={t('preview.view_table')} />
            <ModeTab active={textMode === 'source'} onClick={() => setTextMode('source')} icon={<FileCode size={12} />} label={t('preview.view_source')} />
          </>
        )}
      </div>
    </div>
  )
}

function CsvTable({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <table className="w-full text-left text-[length:var(--text-12)] border-collapse">
        {rows.length > 0 && (
          <thead className="sticky top-0 bg-[var(--bg-sunken)] text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
            <tr>
              {rows[0]?.map((col, cIdx) => (
                <th key={cIdx} className="px-3 py-2 border-r border-[var(--border-subtle)] last:border-r-0 whitespace-nowrap">
                  {col || `#${cIdx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.slice(1).map((row, rIdx) => (
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
  )
}

function TextContent({ bundle, content }: { bundle: FilePreviewBundle; content: string }) {
  const { isMarkdown, isCsv, textMode, renderedMarkdown, csvRows, ext } = bundle
  if (isMarkdown && textMode === 'rendered') {
    return (
      <div
        className="p-5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] prose dark:prose-invert max-w-none text-[length:var(--text-13\.5)] leading-relaxed select-text"
        dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
      />
    )
  }
  if (isCsv && (textMode === 'table' || textMode === 'rendered')) {
    return <CsvTable rows={csvRows} />
  }
  return <CodeViewer code={content} ext={ext} />
}

export function TextPreview({ bundle, content }: { bundle: FilePreviewBundle; content: string | null }) {
  const { isMarkdown, isCsv, isLoading, error } = bundle
  return (
    <div className="space-y-3">
      {(isMarkdown || isCsv) && !isLoading && !error && <ModeTabs bundle={bundle} />}
      {isLoading && (
        <div className="py-20 flex items-center justify-center text-[var(--text-tertiary)] gap-2">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          <span className="text-[length:var(--text-13)]">{t('preview.loading')}</span>
        </div>
      )}
      {error && (
        <div className="py-12 text-center text-[var(--danger)] text-[length:var(--text-13)]">{error}</div>
      )}
      {!isLoading && !error && content !== null && <TextContent bundle={bundle} content={content} />}
    </div>
  )
}