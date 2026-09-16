import { Download } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import type { KanbanFile } from '../types'

const PREVIEW_MODAL_WIDTH = 768

interface KanbanFilePreviewModalProps {
  file: KanbanFile | null
  onClose: () => void
}

function PreviewContent({ file }: { file: KanbanFile }) {
  if (file.mime.startsWith('image/')) {
    return (
      <div className='flex max-h-[70vh] items-center justify-center overflow-auto p-4'>
        <img src={file.url} alt={file.name} className='max-h-[65vh] max-w-full rounded-[var(--r-md)] object-contain' />
      </div>
    )
  }

  if (file.mime === 'application/pdf') {
    return (
      <div className='h-[70vh] w-full p-2'>
        <iframe src={file.url} title={file.name} className='h-full w-full rounded-[var(--r-md)] border border-[var(--border-subtle)]' />
      </div>
    )
  }

  return (
    <div className='flex flex-col items-center justify-center gap-3 p-8 text-center'>
      <div className='text-[length:var(--text-14)] font-medium text-[var(--text-primary)]'>{file.name}</div>
      <div className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {`${(file.size / 1024).toFixed(1)} KB · ${file.mime}`}
      </div>
    </div>
  )
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
        <a
          href={file.url}
          download={file.name}
          className='flex items-center gap-2 rounded-[var(--r-md)] bg-[var(--accent)] px-4 py-2 text-[length:var(--text-13)] font-medium text-white transition-opacity hover:opacity-90'
        >
          <Download size={14} />
          <span>{t('preview.kanban_download_file')}</span>
        </a>
      }
    >
      <PreviewContent file={file} />
    </Modal>
  )
}
