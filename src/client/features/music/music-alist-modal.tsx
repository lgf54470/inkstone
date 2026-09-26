import { useEffect, useRef, useState } from 'react'
import { HardDrive, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal, confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

const ALIST_WIDTH = 560

// FEA-A3: the Alist panel. A3-1 ships the server manager (name/URL/token/root
// path, the token stored server-side only); the browse, import and search views
// build on the server selected here.
export function MusicAlistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servers = useMusic((state) => state.alistServers)
  const loading = useMusic((state) => state.alistServersLoading)
  const loadAlistServers = useMusic((state) => state.loadAlistServers)

  useEffect(() => {
    if (open) void loadAlistServers()
  }, [open, loadAlistServers])

  return (
    <Modal open={open} onClose={onClose} width={ALIST_WIDTH} title={t('music.alist_title')}>
      <div className='space-y-3'>
        {loading && servers.length === 0
          ? <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
          : servers.length === 0
            ? <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.alist_no_servers')}</p>
            : (
                <ul className='space-y-1'>
                  {servers.map((server) => (
                    <ServerRow key={server.id} server={server} />
                  ))}
                </ul>
              )}
        <AddServerForm />
      </div>
    </Modal>
  )
}

function ServerRow({ server }: { server: { id: string; name: string; url: string; rootPath: string } }) {
  const deleteAlistServer = useMusic((state) => state.deleteAlistServer)
  const remove = (): void => {
    void confirm({
      title: t('music.alist_delete'),
      description: t('music.alist_delete_confirm', { value0: server.name }),
      confirmLabel: t('music.alist_delete'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void deleteAlistServer(server.id)
    })
  }
  return (
    <li className='flex h-10 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
      <HardDrive size={14} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{server.name}</span>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{server.url}</span>
      <IconButton label={`${t('music.alist_delete')}: ${server.name}`} size='sm' onClick={remove}>
        <Trash2 size={13} />
      </IconButton>
    </li>
  )
}

function AddServerForm() {
  const [creating, setCreating] = useState(false)
  const name = useRef<HTMLInputElement>(null)
  const url = useRef<HTMLInputElement>(null)
  const token = useRef<HTMLInputElement>(null)
  const rootPath = useRef<HTMLInputElement>(null)

  const add = async (): Promise<void> => {
    const serverName = name.current?.value.trim() ?? ''
    const serverUrl = url.current?.value.trim() ?? ''
    const serverToken = token.current?.value.trim() ?? ''
    if (!serverName || !serverUrl || !serverToken) {
      return
    }
    setCreating(true)
    const ok = await useMusic.getState().createAlistServer({
      name: serverName,
      url: serverUrl,
      rootPath: rootPath.current?.value.trim() || undefined,
      token: serverToken,
    })
    setCreating(false)
    if (ok) {
      for (const field of [name, url, token, rootPath]) {
        if (field.current) field.current.value = ''
      }
    }
  }

  return (
    <form
      className='space-y-2 border-t border-[var(--border-subtle)] pt-3'
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <p className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.alist_add')}</p>
      <div className='grid grid-cols-2 gap-2'>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.alist_name')}</span>
          <Input ref={name} className='h-8 flex-1' aria-label={t('music.alist_name')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.alist_url')}</span>
          <Input ref={url} className='h-8 flex-1' aria-label={t('music.alist_url')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.alist_token')}</span>
          <Input ref={token} type='password' className='h-8 flex-1' aria-label={t('music.alist_token')} />
        </label>
        <label className='flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <span className='shrink-0'>{t('music.alist_root')}</span>
          <Input ref={rootPath} className='h-8 flex-1' aria-label={t('music.alist_root')} />
        </label>
      </div>
      <div className='flex items-center justify-end'>
        <Button size='sm' variant='primary' icon={<Plus size={12} />} loading={creating} onClick={() => void add()}>
          {t('music.alist_add')}
        </Button>
      </div>
    </form>
  )
}
