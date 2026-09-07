import { Download, ExternalLink } from 'lucide-react'
import { Modal } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { cn } from '../../../lib/cn'
import { useFilePreview, type FilePreviewBundle } from './use-file-preview-modal'
import { ImagePreview, MediaPreview, TextPreview, UnsupportedPreview, CopyTextButton } from './file-preview-views'
import type { FilePreviewModalProps } from './types'

function ModalTitle({ bundle }: { bundle: FilePreviewBundle }) {
  const { filename, isImage, naturalSize } = bundle
  return (
    <div className='flex items-center gap-2 max-w-[700px] truncate'>
      <span className='truncate font-semibold'>{filename}</span>
      {isImage && naturalSize && (
        <span className='shrink-0 rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[length:var(--text-11)] font-mono text-[var(--text-tertiary)]'>
          {`${naturalSize.width} × ${naturalSize.height} px`}
        </span>
      )}
    </div>
  )
}

function ModalFooter({ bundle, onClose }: { bundle: FilePreviewBundle; onClose: () => void }) {
  const { isText, textContent, previewUrl, url, filename } = bundle
  return (
    <div className='flex items-center justify-between w-full'>
      <div className='flex items-center gap-2'>
        <a
          href={previewUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer'
        >
          <ExternalLink size={13} />
          <span>{t('preview.open_in_new_tab')}</span>
        </a>
        <a
          href={url}
          download={filename}
          className='inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-[length:var(--text-12)] font-medium text-[var(--accent-contrast)] transition-transform active:translate-y-px cursor-pointer'
        >
          <Download size={13} />
          <span>{t('workspace.download_file')}</span>
        </a>
        {isText && textContent !== null && <CopyTextButton bundle={bundle} />}
      </div>

      <button
        type='button'
        onClick={onClose}
        className='inline-flex h-8 items-center rounded-[var(--r-md)] px-3 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer'
      >
        {t('common.close')}
      </button>
    </div>
  )
}

export function FilePreviewModal({ open, onClose, url, filename }: FilePreviewModalProps) {
  const bundle = useFilePreview({ open, url, filename })
  const { isImage, isPdf, isAudio, isVideo, isText, isMarkdown, textContent } = bundle
  const modalWidth = isPdf || isImage || isVideo ? 1040 : isMarkdown ? 920 : isText ? 860 : isAudio ? 580 : 640

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<ModalTitle bundle={bundle} />}
      width={modalWidth}
      className='max-h-[82vh] flex flex-col'
      footer={<ModalFooter bundle={bundle} onClose={onClose} />}
    >
      <div className={cn('min-h-[280px] flex flex-col', isText || isMarkdown ? 'justify-start' : 'justify-center')}>
        {isImage && <ImagePreview bundle={bundle} />}
        {(isPdf || isAudio || isVideo) && <MediaPreview bundle={bundle} />}
        {isText && <TextPreview bundle={bundle} content={textContent} />}
        {!isImage && !isPdf && !isAudio && !isVideo && !isText && <UnsupportedPreview bundle={bundle} />}
      </div>
    </Modal>
  )
}