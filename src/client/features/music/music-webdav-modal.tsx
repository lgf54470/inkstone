import { useEffect, useRef } from 'react'
import { CornerLeftUp, FileAudio, FolderClosed, Plus, RefreshCw, Server, Settings, Upload } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Modal, Tooltip } from '../../components/overlay'
import { Empty } from '../../components/feedback'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useMusic } from './music-store'
import { formatBytes } from './music-utils'

const WEBDAV_WIDTH = 640

export function MusicWebdavModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const webdav = useMusic((state) => state.webdav)
  const browseWebdav = useMusic((state) => state.browseWebdav)
  const importWebdavFolder = useMusic((state) => state.importWebdavFolder)
  const uploadFiles = useMusic((state) => state.uploadFiles)
  const setUploadTarget = useMusic((state) => state.setUploadTarget)
  const setTransfersOpen = useMusic((state) => state.setTransfersOpen)
  const inputRef = useRef<HTMLInputElement>(null)

  useWebdavBootstrap(open, webdav.dir, webdav.loading, browseWebdav)
  const parentPath = webdav.path.includes('/') ? webdav.path.slice(0, webdav.path.lastIndexOf('/')) : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={WEBDAV_WIDTH}
      title={t('music.webdav_title')}
      footer={
        <>
          <Button size='sm' icon={<Upload size={13} />} onClick={() => inputRef.current?.click()}>{t('music.webdav_upload')}</Button>
          <Button size='sm' variant='primary' disabled={!webdav.entries.length} onClick={() => void importWebdavFolder()}>
            {t('music.webdav_import_all')}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <WebdavUploadInput
          inputRef={inputRef}
          onFiles={(files) => {
            setUploadTarget('webdav')
            void uploadFiles(files, 'webdav')
            setTransfersOpen(true)
            onClose()
          }}
        />
        {webdav.configured
          ? <Browser parentPath={parentPath} />
          : <NotConfigured reason={webdav.error} />}
      </div>
    </Modal>
  )
}

function useWebdavBootstrap(
  open: boolean,
  dir: string,
  loading: boolean,
  browse: (path: string) => Promise<void>,
): void {
  useEffect(() => {
    if (open && !dir && !loading) void browse('')
  }, [open, dir, loading, browse])
}

function WebdavUploadInput({
  inputRef,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onFiles: (files: File[]) => void
}) {
  return (
    <input
      ref={inputRef}
      type='file'
      accept='audio/*'
      multiple
      hidden
      onChange={(event) => {
        const files = [...(event.target.files ?? [])]
        event.target.value = ''
        if (files.length) onFiles(files)
      }}
    />
  )
}

function Browser({ parentPath }: { parentPath: string }) {
  const webdav = useMusic((state) => state.webdav)
  const browseWebdav = useMusic((state) => state.browseWebdav)
  const importWebdavTrack = useMusic((state) => state.importWebdavTrack)
  const directory = webdav.directory || webdav.dir
  return (
    <>
      <div className='flex items-center gap-2'>
        <Tooltip label={t('music.up')} side='top'>
          <IconButton label={t('music.up')} size='sm' disabled={!webdav.path} onClick={() => void browseWebdav(parentPath)}>
            <CornerLeftUp size={14} />
          </IconButton>
        </Tooltip>
        <span className='min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {directory || '/'}
        </span>
        <Tooltip label={t('common.refresh')} side='top'>
          <IconButton label={t('common.refresh')} size='sm' disabled={webdav.loading} onClick={() => void browseWebdav(webdav.path)}>
            <RefreshCw size={13} className={webdav.loading ? 'animate-spin' : undefined} />
          </IconButton>
        </Tooltip>
      </div>

      {webdav.loading && !webdav.entries.length
        ? <p className='py-10 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]' role='status'>{t('music.webdav_loading')}</p>
        : webdav.entries.length === 0
          ? <Empty art='folder' title={t('music.webdav_empty')} description={t('music.music_dir_hint')} compact />
          : (
            <ul className='max-h-80 space-y-0.5 overflow-y-auto'>
              {webdav.entries.map((entry) => (
                <WebdavRow
                  key={entry.path}
                  name={entry.name}
                  path={entry.path}
                  isDirectory={entry.isDirectory}
                  sizeBytes={entry.sizeBytes}
                  importing={webdav.importingPath === entry.path}
                  onOpen={() => void browseWebdav(entry.path)}
                  onImport={() => void importWebdavTrack(entry)}
                />
              ))}
            </ul>
          )}
    </>
  )
}

function WebdavRow({
  name,
  isDirectory,
  sizeBytes,
  importing,
  onOpen,
  onImport,
}: {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number
  importing: boolean
  onOpen: () => void
  onImport: () => void
}) {
  return (
    <li className={cn('group/row flex items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 hover:bg-[var(--bg-hover)]')}>
      <span className='flex size-7 shrink-0 items-center justify-center text-[var(--text-quaternary)]'>
        {isDirectory ? <FolderClosed size={14} /> : <FileAudio size={14} />}
      </span>
      <button
        type='button'
        onClick={isDirectory ? onOpen : onImport}
        className='min-w-0 flex-1 truncate text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      >
        {name}
      </button>
      <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {isDirectory ? '' : formatBytes(sizeBytes)}
      </span>
      {isDirectory
        ? <span className='w-16 shrink-0' aria-hidden='true' />
        : (
          <Button size='sm' variant='subtle' loading={importing} icon={<Plus size={12} />} onClick={onImport}>
            {t('music.webdav_import')}
          </Button>
        )}
    </li>
  )
}

function NotConfigured({ reason }: { reason: string | null }) {
  return (
    <div className='space-y-3 rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] bg-[var(--bg-inset)] px-4 py-6 text-center'>
      <Server size={20} className='mx-auto text-[var(--text-quaternary)]' aria-hidden='true' />
      <p className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>{t('music.webdav_not_configured')}</p>
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{reason ?? t('music.webdav_configure_hint')}</p>
      <Button size='sm' icon={<Settings size={13} />} onClick={() => useUi.getState().openPanel('settings')}>
        {t('music.webdav_open_settings')}
      </Button>
    </div>
  )
}