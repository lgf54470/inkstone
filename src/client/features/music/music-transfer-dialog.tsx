import { useCallback, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, TriangleAlert, Upload, X } from 'lucide-react'
import { Button, IconButton, Spinner } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Modal } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t, type MessageKey } from '../../lib/i18n'
import type { MusicDownloadTask, MusicLibraryJob, MusicLibraryJobKind, MusicTransferTarget, MusicUploadTask } from './music-store'
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
  const libraryJobs = useMusic((state) => state.libraryJobs)
  const target = useMusic((state) => state.uploadTarget)
  const setUploadTarget = useMusic((state) => state.setUploadTarget)
  const dismissUpload = useMusic((state) => state.dismissUpload)
  const dismissDownload = useMusic((state) => state.dismissDownload)
  const dismissLibraryJob = useMusic((state) => state.dismissLibraryJob)

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
      {libraryJobs.length > 0 && (
        <TaskSection label={t('music.transfers_library_jobs')}>
          {libraryJobs.map((job) => <LibraryJobRow key={job.kind} job={job} onDismiss={() => dismissLibraryJob(job.kind)} />)}
        </TaskSection>
      )}
    </div>
  )
}

export function UploadPicker({ target }: { target: MusicTransferTarget }) {
  const uploadFiles = useMusic((state) => state.uploadFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback((files: FileList | null) => {
    if (files?.length) void uploadFiles([...files], target)
  }, [uploadFiles, target])

  return (
    <>
      <DropZone
        onFiles={accept}
        onChoose={() => inputRef.current?.click()}
        onChooseFolder={() => folderInputRef.current?.click()}
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
      <input
        ref={(node) => {
          folderInputRef.current = node
          // The directory picker relies on non-standard attributes React types do not carry.
          node?.setAttribute('webkitdirectory', '')
          node?.setAttribute('directory', '')
        }}
        type='file'
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

// dragenter and dragleave also fire when the pointer crosses a child, so the highlight
// follows an enter/leave depth count and only clears once the pointer really leaves.
export function DropZone({ onFiles, onChoose, onChooseFolder }: {
  onFiles: (files: FileList | null) => void
  onChoose: () => void
  onChooseFolder?: () => void
}) {
  const depthRef = useRef(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const setOver = (over: boolean): void => {
    if (!over) depthRef.current = 0
    setIsDragOver(over)
  }
  return (
    <div
      onDragEnter={() => {
        depthRef.current += 1
        setIsDragOver(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depthRef.current -= 1
        if (depthRef.current <= 0) setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        onFiles(event.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-dashed px-4 py-8 text-center transition-colors',
        isDragOver ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-default)] bg-[var(--bg-inset)]',
      )}
    >
      <Upload size={20} className='text-[var(--text-quaternary)]' aria-hidden='true' />
      <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('music.upload_hint')}</p>
      <div className='flex items-center gap-2'>
        <Button size='sm' onClick={onChoose}>{t('music.upload_choose')}</Button>
        {onChooseFolder && <Button size='sm' onClick={onChooseFolder}>{t('music.upload_choose_folder')}</Button>}
      </div>
    </div>
  )
}

function TaskSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className='space-y-1'>
      <h3 className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{label}</h3>
      <ul tabIndex={0} aria-label={label} className='max-h-52 space-y-1 overflow-y-auto'>{children}</ul>
    </section>
  )
}

function TaskRow({ children, name, onDismiss, label = 'music.upload_dismiss' }: { children: ReactNode; name: string; onDismiss: () => void; label?: MessageKey }) {
  return (
    <li className='flex items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 hover:bg-[var(--bg-hover)]'>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{name}</span>
        {children}
      </span>
      <IconButton label={t(label)} size='sm' onClick={onDismiss}><X size={13} /></IconButton>
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
    <TaskRow name={task.name} onDismiss={onDismiss} label={task.status === 'uploading' ? 'music.upload_cancel' : 'music.upload_dismiss'}>
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

const LIBRARY_JOB_LABELS: Record<MusicLibraryJobKind, 'music.job_metadata' | 'music.job_covers'> = {
  metadata: 'music.job_metadata',
  covers: 'music.job_covers',
}

function LibraryJobRow({ job, onDismiss }: { job: MusicLibraryJob; onDismiss: () => void }) {
  const percent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 100
  const progressLabel = t('music.job_progress', { value0: job.done, value1: job.total })
  return (
    <TaskRow name={t(LIBRARY_JOB_LABELS[job.kind])} onDismiss={onDismiss}>
      <span className='flex items-center gap-1.5 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {job.status === 'running' && <Spinner size={11} />}
        {job.status === 'failed' && <TriangleAlert size={11} className='text-[var(--danger)]' />}
        {progressLabel}
      </span>
      {job.status === 'running' && <Progress value={percent} label={progressLabel} />}
      {job.status === 'failed' && (
        <span className='block truncate text-[length:var(--text-10)] text-[var(--danger)]'>{t('music.job_failed')}</span>
      )}
    </TaskRow>
  )
}
