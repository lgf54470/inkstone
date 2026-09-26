import { useEffect, useRef, useState } from 'react'
import { CornerLeftUp, FileAudio, FolderClosed, HardDrive, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal, confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { formatBytes } from '../../lib/time'
import { useMusic } from './music-store'
import type { MusicAlistEntry } from '../../lib/api'

const ALIST_WIDTH = 560

// FEA-A3: the Alist panel. A3-1 ships the server manager (name/URL/token/root
// path, the token stored server-side only); the browse, import and search views
// build on the server selected here.
export function MusicAlistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servers = useMusic((state) => state.alistServers)
  const loading = useMusic((state) => state.alistServersLoading)
  const loadAlistServers = useMusic((state) => state.loadAlistServers)
  const [view, setView] = useState<'servers' | 'browse'>('servers')
  const browse = useMusic((state) => state.alistBrowse)
  // The search lives here, not in the store: it is a one-shot view over one
  // server, and the import-all footer only makes sense for the directory view.
  const [search, setSearch] = useState<{ keywords: string; entries: MusicAlistEntry[] } | null>(null)

  useEffect(() => {
    if (open) void loadAlistServers()
  }, [open, loadAlistServers])

  const selectedServer = servers.find((server) => server.id === browse.serverId) ?? null
  const runSearch = async (keywords: string): Promise<void> => {
    const entries = await useMusic.getState().searchAlist(browse.serverId ?? '', keywords)
    setSearch({ keywords, entries })
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={ALIST_WIDTH}
      title={t('music.alist_title')}
      footer={view === 'browse' && selectedServer && !search
        ? (
            <Button
              size='sm'
              variant='primary'
              icon={<Upload size={13} />}
              disabled={!browse.entries.some((entry) => !entry.isDir) || browse.importingPaths.length > 0}
              loading={browse.importingPaths.length > 0}
              onClick={() => void useMusic.getState().importAlistFolder()}
            >
              {t('music.alist_import_all')}
            </Button>
          )
        : undefined}
    >
      <div className='space-y-3'>
        {view === 'browse' && selectedServer
          ? (
              <Browser
                server={selectedServer}
                search={search}
                onSearch={(keywords) => void runSearch(keywords)}
                onClearSearch={() => setSearch(null)}
                onManage={() => setView('servers')}
              />
            )
          : (
              <>
                {loading && servers.length === 0
                  ? <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
                  : servers.length === 0
                    ? <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.alist_no_servers')}</p>
                    : (
                        <ul className='space-y-1'>
                          {servers.map((server) => (
                            <ServerRow key={server.id} server={server} onBrowse={() => setView('browse')} />
                          ))}
                        </ul>
                      )}
                <AddServerForm />
              </>
            )}
      </div>
    </Modal>
  )
}

function ServerRow({ server, onBrowse }: { server: { id: string; name: string; url: string; rootPath: string }; onBrowse: () => void }) {
  const deleteAlistServer = useMusic((state) => state.deleteAlistServer)
  const browseAlist = useMusic((state) => state.browseAlist)
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
      <Button size='sm' onClick={() => { onBrowse(); void browseAlist(server.id, '/') }}>{t('music.alist_browse')}</Button>
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
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.alist_hint')}</p>
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


// FEA-A3-2: the directory browser. Up = one segment; a directory row re-lists
// under it; a file row imports on demand. FEA-A3-3 adds the in-app search: while
// a search is showing, the directory list is replaced by its results.
function Browser({ server, search, onSearch, onClearSearch, onManage }: {
  server: { id: string; name: string }
  search: { keywords: string; entries: MusicAlistEntry[] } | null
  onSearch: (keywords: string) => void
  onClearSearch: () => void
  onManage: () => void
}) {
  const browse = useMusic((state) => state.alistBrowse)
  const browseAlist = useMusic((state) => state.browseAlist)
  const importAlistTrack = useMusic((state) => state.importAlistTrack)
  const serverId = server.id
  const parentPath = browse.path.includes('/') ? browse.path.slice(0, browse.path.lastIndexOf('/')) || '/' : '/'
  const [draft, setDraft] = useState('')
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    if (browse.serverId !== serverId) {
      onClearSearch()
      void browseAlist(serverId, '/')
    }
  }, [browse.serverId, serverId, browseAlist, onClearSearch])

  const submitSearch = (): void => {
    const keywords = draft.trim()
    if (!keywords) {
      onClearSearch()
      return
    }
    setSearching(true)
    onSearch(keywords)
    setSearching(false)
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <Button size='sm' icon={<CornerLeftUp size={12} />} disabled={browse.path === '/' || search !== null} onClick={() => void browseAlist(serverId, parentPath)}>
          {t('music.alist_up')}
        </Button>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{server.name}{browse.path === '/' ? '' : browse.path}</span>
          <Button size='sm' onClick={onManage}>{t('music.alist_manage')}</Button>
        </div>
      </div>
      <div className='flex items-center gap-1.5'>
        <Input
          value={draft}
          aria-label={t('music.alist_search')}
          placeholder={t('music.alist_search_placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitSearch()
            }
          }}
          className='h-8 min-w-0 flex-1'
        />
        <Button size='sm' icon={<Search size={12} />} loading={searching} onClick={submitSearch}>
          {t('music.alist_search')}
        </Button>
      </div>
      {search !== null
        ? (
            <div className='space-y-1'>
              <div className='flex items-center justify-between'>
                <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{search.keywords}</p>
                <IconButton label={t('music.alist_search_clear')} size='sm' onClick={() => { setDraft(''); onClearSearch() }}>
                  <X size={13} />
                </IconButton>
              </div>
              {search.entries.length === 0
                ? <p role='status' className='py-4 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.alist_search_empty')}</p>
                : (
                    <ul className='max-h-72 space-y-0.5 overflow-y-auto'>
                      {search.entries.map((entry) => (
                        <AlistFileRow
                          key={entry.path}
                          entry={entry}
                          importingPaths={browse.importingPaths}
                          onImport={() => void importAlistTrack(serverId, entry)}
                        />
                      ))}
                    </ul>
                  )}
            </div>
          )
        : browse.error
          ? <p role='status' className='py-4 text-center text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{browse.error}</p>
          : browse.loading && !browse.entries.length
            ? <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
            : browse.entries.length === 0
              ? <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.alist_empty_dir')}</p>
              : (
                  <ul className='max-h-72 space-y-0.5 overflow-y-auto'>
                    {browse.entries.map((entry) => entry.isDir
                      ? (
                          <li key={entry.path} className='flex h-9 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
                            <FolderClosed size={13} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
                            <button type='button' className='min-w-0 flex-1 truncate text-left text-[length:var(--text-12)] text-[var(--text-primary)]' onClick={() => void browseAlist(serverId, entry.path)}>
                              {entry.name}
                            </button>
                          </li>
                        )
                      : (
                          <AlistFileRow
                            key={entry.path}
                            entry={entry}
                            importingPaths={browse.importingPaths}
                            onImport={() => void importAlistTrack(serverId, entry)}
                          />
                        ))}
                  </ul>
                )}
    </div>
  )
}

// Shared by the directory view and the search results: a media file with its
// size and one-shot import. The full path rides the title so same-named files
// from different directories stay tellable apart in the search results.
function AlistFileRow({ entry, importingPaths, onImport }: {
  entry: MusicAlistEntry
  importingPaths: string[]
  onImport: () => void
}) {
  const importing = importingPaths.includes(entry.path)
  return (
    <li className='flex h-9 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
      <FileAudio size={13} className='shrink-0 text-[var(--text-tertiary)]' aria-hidden='true' />
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]' title={entry.path}>{entry.name}</span>
      <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatBytes(entry.size)}</span>
      <Button size='sm' disabled={importing} loading={importing} onClick={onImport}>
        {t('music.alist_import')}
      </Button>
    </li>
  )
}
