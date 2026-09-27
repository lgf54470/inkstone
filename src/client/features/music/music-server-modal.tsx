import { useEffect, useState } from 'react'
import { Plus, Search, Server, X } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Input, Select } from '../../components/form'
import { Modal } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import { useMusic } from './music-store'
import { MusicServerManager, useLoadServerSources } from './music-server-manager'
import { PanelFailure } from './music-panel-failure'
import type { MusicServerHit } from '../../lib/api'

const SERVER_WIDTH = 560

// FB-M16: searching the reader's own music server, and taking what they find into the library. The
// modal is the second of the two surfaces the manager serves: registration lives here too (its
// "Servers" view is the same component the settings page draws), because the first search is usually
// also the moment a server gets added.
export function MusicServerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servers = useMusic((state) => state.serverSources)
  const [managing, setManaging] = useState(false)
  // The list is asked for once, when the modal opens, and the manager below draws it rather than
  // fetching a second time beside this one.
  useLoadServerSources(open)
  // With nothing registered there is only one useful thing to show, so the manager opens itself
  // rather than presenting an empty picker with a hint next to it.
  const showManager = managing || servers.length === 0
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={SERVER_WIDTH}
      title={t('music.server_title')}
      footer={showManager ? undefined : <SearchFooter onManage={() => setManaging(true)} />}
    >
      {showManager
        ? (
            <div className='space-y-2'>
              <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.server_manage_hint')}</p>
              <MusicServerManager />
            </div>
          )
        : <ServerSearchView onManage={() => setManaging(true)} />}
    </Modal>
  )
}

function SearchFooter({ onManage }: { onManage: () => void }) {
  return (
    <Button size='sm' icon={<Server size={12} />} onClick={onManage}>{t('music.server_manage')}</Button>
  )
}

// What the search view needs to do, apart from how it is drawn: which server is in front, the query
// in the box, and the two calls a result list has (ask again, take them all).
function useServerSearch() {
  const servers = useMusic((state) => state.serverSources)
  const search = useMusic((state) => state.serverSearch)
  const selectServer = useMusic((state) => state.selectServerSourceForSearch)
  const searchServerSource = useMusic((state) => state.searchServerSource)
  const clearServerSearch = useMusic((state) => state.clearServerSearch)
  const importServerHits = useMusic((state) => state.importServerHits)
  const [draft, setDraft] = useState('')
  const [addingAll, setAddingAll] = useState(false)
  const serverId = search.serverId ?? servers[0]?.id ?? null
  // The first server is preselected rather than guessed at search time: the query belongs to a
  // server, and the reader can move it before typing.
  useEffect(() => {
    if (!search.serverId && serverId) selectServer(serverId)
  }, [search.serverId, serverId, selectServer])

  const submit = (): void => {
    const keywords = draft.trim()
    if (!serverId || !keywords) return
    void searchServerSource(serverId, keywords)
  }
  const addAll = (): void => {
    if (!serverId || !search.hits.length) return
    setAddingAll(true)
    void importServerHits(serverId, search.hits).finally(() => setAddingAll(false))
  }
  const clear = (): void => {
    setDraft('')
    clearServerSearch()
  }
  return { servers, search, serverId, draft, setDraft, addingAll, select: selectServer, submit, addAll, clear }
}

function ServerSearchView({ onManage }: { onManage: () => void }) {
  const state = useServerSearch()
  const { search } = state
  const serverName = state.servers.find((entry) => entry.id === state.serverId)?.name ?? ''
  return (
    <div className='space-y-2'>
      <SearchControls state={state} onManage={onManage} />
      <Results
        serverName={serverName}
        searching={search.searching}
        error={search.error}
        hits={search.hits}
        searched={search.keywords !== ''}
        importingItemIds={search.importingItemIds}
        onRetry={state.submit}
        onAddAll={state.addAll}
        addingAll={state.addingAll}
      />
    </div>
  )
}

function SearchControls({ state, onManage }: { state: ReturnType<typeof useServerSearch>; onManage: () => void }) {
  return (
    <>
      <div className='flex items-end gap-2'>
        <label className='flex min-w-0 flex-1 flex-col gap-1'>
          <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>{t('music.server_title')}</span>
          <Select className='h-8' value={state.serverId ?? ''} onChange={(event) => state.select(event.target.value)}>
            {state.servers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Select>
        </label>
        <Button size='sm' onClick={onManage}>{t('music.server_manage')}</Button>
      </div>
      <div className='flex items-center gap-1.5'>
        <Input
          value={state.draft}
          aria-label={t('music.server_search')}
          placeholder={t('music.server_search_placeholder')}
          onChange={(event) => state.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              state.submit()
            }
          }}
          className='h-8 min-w-0 flex-1'
        />
        <Button size='sm' icon={<Search size={12} />} loading={state.search.searching} onClick={state.submit}>
          {t('music.server_search')}
        </Button>
        {state.search.keywords && (
          <IconButton label={t('music.alist_search_clear')} size='sm' onClick={state.clear}>
            <X size={13} />
          </IconButton>
        )}
      </div>
    </>
  )
}

interface ResultsProps {
  serverName: string
  searching: boolean
  error: string | null
  hits: MusicServerHit[]
  searched: boolean
  importingItemIds: string[]
  onRetry: () => void
  onAddAll: () => void
  addingAll: boolean
}

// Every state the results area can be in has words: asking, refused, answered-nothing, answered.
// The old catalogue panel taught this lesson the hard way (FB-F2) — a blank area under a search box
// reads as a dead control.
function Results({ serverName, searching, error, hits, searched, importingItemIds, onRetry, onAddAll, addingAll }: ResultsProps) {
  if (searching) {
    return <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
  }
  if (error) {
    return <PanelFailure message={t('music.server_search_failed', { value0: error })} onRetry={onRetry} />
  }
  if (!searched) {
    return <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.server_search_placeholder')}</p>
  }
  if (!hits.length) {
    return <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.server_search_empty')}</p>
  }
  return (
    <div className='space-y-1'>
      <div className='flex items-center justify-between gap-2'>
        <span role='status' className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{serverName}</span>
        <Button size='sm' loading={addingAll} onClick={onAddAll}>{t('music.server_add_all')}</Button>
      </div>
      <ul className='max-h-72 space-y-0.5 overflow-y-auto'>
        {hits.map((hit) => (
          <HitRow key={hit.itemId} hit={hit} importing={importingItemIds.includes(hit.itemId)} />
        ))}
      </ul>
    </div>
  )
}

function HitRow({ hit, importing }: { hit: MusicServerHit; importing: boolean }) {
  const search = useMusic((state) => state.serverSearch)
  const importServerHit = useMusic((state) => state.importServerHit)
  const serverId = search.serverId
  const subtitle = [hit.artist, hit.album].filter(Boolean).join(' · ')
  return (
    <li className='flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-1 hover:bg-[var(--bg-hover)]'>
      <span aria-hidden='true' className='grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--bg-inset)] text-[var(--text-quaternary)]'>
        <Server size={14} />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{hit.title}</span>
        {subtitle && <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{subtitle}</span>}
      </span>
      {/* Several servers report no length at all, and 00:00 would be a claim they did not make. */}
      <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {hit.durationMs ? formatTimecode(hit.durationMs) : t('music.duration_unknown')}
      </span>
      <Button
        size='sm'
        icon={<Plus size={12} />}
        disabled={importing}
        loading={importing}
        onClick={() => {
          if (serverId) void importServerHit(serverId, hit)
        }}
      >
        {t('music.server_add_one')}
      </Button>
    </li>
  )
}
