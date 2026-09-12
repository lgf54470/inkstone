import { useCallback, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, TriangleAlert, Upload, X } from 'lucide-react'
import { Button, IconButton, Spinner } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Modal } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { MusicDownloadTask, MusicTransferTarget, MusicUploadTask } from './music-store'
import { useMusic } from './music-store'

const TRANSFER_WIDTH = 520
const TARGETS: { value: MusicTransferTarget; label: 'music.source_r2' | 'music.source_webdav' }[] = [
  { value: 'r2', label: 'music.source_r2' },
  { value: 'webdav', label: 'music.source_webdav' },
]

export function MusicTransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={TRANSFER_WIDTH}
      title={t('music.transfer_title')}
      footer={<Button size='sm' variant='primary' onClick={onClose}>{t('common.close')}</Button>}
    >
      <TransferBody />
    </Modal>
  )
}

function TransferBody() {
  const uploads = useMusic((state) => state.uploads)
  const downloads = useMusic((state) => state.downloads)
  const target = useMusic((state) => state.uploadTarget)
  const setUploadTarget = useMusic((state) => state.setUploadTarget)
  const dismissUpload = useMusic((state) => state.dismissUpload)
  const dismissDownload = useMusic((state) => state.dismissDownload)

  return (
    <div className='space-y-3'>
      <Segmented
        label={t('music.upload_target')}
        size='sm'
        value={target}
        onChange={setUploadTarget}
        options={TARGETS.map((option) => ({ value: option.value, label: t(option.label) }))}
      />
      <UploadPicker target={target} />
      {uploads.length > 0 && (
        <TaskSection label={t('music.transfers_uploads')}>
          {uploads.map((task) => <UploadTaskRow key={task.id} task={task} onDismiss={() => dismissUpload(task.id)} />)}
        </TaskSection>
      )}
      {downloads.length > 0 && (
        <TaskSection label={t('music.transfers_downloads')}>
          {downloads.map((task) => <DownloadTaskRow key={task.id} task={task} onDismiss={() => dismissDownload(task.id)} />)}
        </TaskSection>
      )}
    </div>
  )
}

function UploadPicker({ target }: { target: MusicTransferTarget }) {
  const uploadFiles = useMusic((state) => state.uploadFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const accept = useCallback((files: FileList | null) => {
    if (files?.length) void uploadFiles([...files], target)
  }, [uploadFiles, target])

  return (
    <>
      <DropZone
        isDragOver={isDragOver}
        onDragOver={setIsDragOver}
        onFiles={accept}
        onChoose={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type='file'
        accept='audio/*'
        multiple
        hidden
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )
}

function DropZone({
  isDragOver,
  onDragOver,
  onFiles,
  onChoose,
}: {
  isDragOver: boolean
  onDragOver: (over: boolean) => void
  onFiles: (files: FileList | null) => void
  onChoose: () => void
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(true)
      }}
      onDragLeave={() => onDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        onDragOver(false)
        onFiles(event.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-dashed px-4 py-8 text-center transition-colors',
        isDragOver ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border-default)] bg-[var(--bg-inset)]',
      )}
    >
      <Upload size={20} className='text-[var(--text-quaternary)]' aria-hidden='true' />
      <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.upload_hint')}</p>
      <Button size='sm' onClick={onChoose}>{t('music.upload_choose')}</Button>
    </div>
  )
}

function TaskSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className='space-y-1'>
      <h3 className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{label}</h3>
      <ul className='max-h-52 space-y-1 overflow-y-auto'>{children}</ul>
    </section>
  )
}

function TaskRow({ children, name, onDismiss }: { children: ReactNode; name: string; onDismiss: () => void }) {
  return (
    <li className='flex items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 hover:bg-[var(--bg-hover)]'>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{name}</span>
        {children}
      </span>
      <IconButton label={t('music.upload_dismiss')} size='sm' onClick={onDismiss}><X size={13} /></IconButton>
    </li>
  )
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <progress
      className='mt-1 h-1 w-full overflow-hidden rounded-[var(--r-full)]'
      value={value}
      max={100}
      aria-label={label}
    />
  )
}

function UploadTaskRow({ task, onDismiss }: { task: MusicUploadTask; onDismiss: () => void }) {
  return (
    <TaskRow name={task.name} onDismiss={onDismiss}>
      <span className='flex items-center gap-1.5 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {task.status === 'uploading' && <Spinner size={11} />}
        {task.status === 'done' && <CheckCircle2 size={11} className='text-[var(--success)]' />}
        {task.status === 'failed' && <TriangleAlert size={11} className='text-[var(--danger)]' />}
        {t(task.target === 'webdav' ? 'music.source_webdav' : 'music.source_r2')}
      </span>
      {task.status === 'uploading' && <Progress value={task.percent} label={t('music.upload_progress', { value0: task.percent })} />}
      {task.status === 'failed' && (
        <span className='block truncate text-[length:var(--text-10)] text-[var(--danger)]'>{t('music.upload_failed')}</span>
      )}
    </TaskRow>
  )
}

function DownloadTaskRow({ task, onDismiss }: { task: MusicDownloadTask; onDismiss: () => void }) {
  return (
    <TaskRow name={task.name} onDismiss={onDismiss}>
      <span className='flex items-center gap-1.5 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {task.status === 'downloading' && <Spinner size={11} />}
        {task.status === 'done' && <CheckCircle2 size={11} className='text-[var(--success)]' />}
        {task.status === 'failed' && <TriangleAlert size={11} className='text-[var(--danger)]' />}
        {task.status === 'downloading' && t('music.download_progress', { value0: task.percent })}
      </span>
      {task.status === 'downloading' && <Progress value={task.percent} label={t('music.download_progress', { value0: task.percent })} />}
      {task.status === 'failed' && (
        <span className='block truncate text-[length:var(--text-10)] text-[var(--danger)]'>{t('music.download_failed')}</span>
      )}
    </TaskRow>
  )
}
