import { useCallback, useRef, useState } from 'react'
import type { MusicTrack } from '@shared/types'
import { Clock3, CloudDownload, ImageDown, RefreshCw, Search, Server, Upload, X } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Segmented, Input } from '../../components/form'
import { Tooltip, useClickOutside } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic, useVisibleTracks } from './music-store'
import type { MusicSort } from './music-store'

const SORT_OPTIONS: { value: MusicSort; label: 'music.sort_recent' | 'music.sort_title' | 'music.sort_artist' | 'music.sort_plays' }[] = [
  { value: 'recent', label: 'music.sort_recent' },
  { value: 'title', label: 'music.sort_title' },
  { value: 'artist', label: 'music.sort_artist' },
  { value: 'plays', label: 'music.sort_plays' },
]

export function MusicHubToolbar({ onUpload, onBrowseWebdav }: { onUpload: () => void; onBrowseWebdav: () => void }) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <SearchBox />
        <SourceFilter />
      </div>
      <ToolbarActions onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} />
    </div>
  )
}

function SourceFilter() {
  const sourceFilter = useMusic((state) => state.sourceFilter)
  const setSourceFilter = useMusic((state) => state.setSourceFilter)
  const options = [
    { value: 'all' as const, label: t('music.source_all') },
    { value: 'r2' as const, label: t('music.source_r2') },
    { value: 'webdav' as const, label: t('music.source_webdav') },
  ]
  return (
    <div role='radiogroup' aria-label={t('music.source_filter')} className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-0.5'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          role='radio'
          aria-checked={sourceFilter === option.value}
          onClick={() => setSourceFilter(option.value)}
          className={cn(
            'rounded-[var(--r-sm)] px-2 py-0.5 text-[length:var(--text-11)] transition-colors',
            sourceFilter === option.value
              ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-[var(--shadow-sm)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function SearchBox() {
  const query = useMusic((state) => state.query)
  const history = useMusic((state) => state.searchHistory)
  const setQuery = useMusic((state) => state.setQuery)
  const commitQuery = useMusic((state) => state.commitQuery)
  const clearSearchHistory = useMusic((state) => state.clearSearchHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useClickOutside([boxRef], historyOpen, () => setHistoryOpen(false))

  const runSearch = useCallback((value: string) => {
    commitQuery(value)
    setHistoryOpen(false)
  }, [commitQuery])

  return (
    <div ref={boxRef} className='relative w-60 md:w-72'>
      <Input
        leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
        value={query}
        aria-label={t('music.search_placeholder')}
        placeholder={t('music.search_placeholder')}
        className='h-8 text-[length:var(--text-12)]'
        onFocus={() => setHistoryOpen(true)}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') runSearch(query)
          if (event.key === 'Escape') setHistoryOpen(false)
        }}
      />
      {query && (
        <span className='absolute top-1/2 right-1 -translate-y-1/2'>
          <IconButton label={t('music.search_clear')} size='sm' onClick={() => runSearch('')}><X size={12} /></IconButton>
        </span>
      )}
      {historyOpen && !query && history.length > 0 && (
        <SearchHistory
          history={history}
          onPick={runSearch}
          onClear={() => {
            clearSearchHistory()
            setHistoryOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ToolbarActions({ onUpload, onBrowseWebdav }: { onUpload: () => void; onBrowseWebdav: () => void }) {
  const sort = useMusic((state) => state.sort)
  const loading = useMusic((state) => state.loading)
  const setSort = useMusic((state) => state.setSort)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const tracks = useVisibleTracks()
  return (
    <div className='flex items-center gap-2'>
      <Segmented
        label={t('music.sort')}
        size='sm'
        value={sort}
        onChange={setSort}
        options={SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
      />
      <span className='h-4 w-px bg-[var(--border-subtle)]' />
      <Button size='sm' variant='primary' icon={<Upload size={12} />} onClick={onUpload}>{t('music.upload')}</Button>
      <Button size='sm' icon={<Server size={12} />} onClick={onBrowseWebdav}>{t('music.webdav_title')}</Button>
      <Tooltip label={t('common.refresh')} side='left'>
        <IconButton label={t('common.refresh')} size='sm' disabled={loading} onClick={() => void loadLibrary()}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
      </Tooltip>
      <MetadataButtons tracks={tracks} />
    </div>
  )
}

function MetadataButtons({ tracks }: { tracks: MusicTrack[] }) {
  const refreshTrackMetadata = useMusic((state) => state.refreshTrackMetadata)
  const matchMissingCovers = useMusic((state) => state.matchMissingCovers)
  const [scanning, setScanning] = useState(false)
  const [matching, setMatching] = useState(false)
  const missingIds = tracks.filter((track) => !track.coverUrl || !track.lyric || track.durationMs === 0).map((track) => track.id)
  const coverlessCount = tracks.filter((track) => !track.coverUrl).length
  const scan = (): void => {
    if (!missingIds.length || scanning) return
    setScanning(true)
    void refreshTrackMetadata(missingIds).finally(() => setScanning(false))
  }
  const matchCovers = (): void => {
    if (!coverlessCount || matching) return
    setMatching(true)
    void matchMissingCovers().finally(() => setMatching(false))
  }
  return (
    <>
      <Tooltip label={t('music.refresh_metadata')} side='left'>
        <IconButton label={t('music.refresh_metadata')} size='sm' disabled={!missingIds.length || scanning} onClick={scan}>
          <ImageDown size={14} className={scanning ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.match_covers')} side='left'>
        <IconButton label={t('music.match_covers')} size='sm' disabled={!coverlessCount || matching} onClick={matchCovers}>
          <CloudDownload size={14} className={matching ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
    </>
  )
}

function SearchHistory({
  history,
  onPick,
  onClear,
}: {
  history: string[]
  onPick: (value: string) => void
  onClear: () => void
}) {
  return (
    <div className='absolute top-full left-0 z-[var(--z-popover)] mt-1 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'>
      <div className='flex items-center justify-between px-2 py-1 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        <span>{t('music.search_history')}</span>
        <button type='button' onClick={onClear} className='rounded px-1 hover:text-[var(--text-secondary)]'>
          {t('music.search_clear_history')}
        </button>
      </div>
      {history.map((entry) => (
        <button
          key={entry}
          type='button'
          onClick={() => onPick(entry)}
          className='flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Clock3 size={12} className='shrink-0 opacity-70' />
          <span className='truncate'>{entry}</span>
        </button>
      ))}
    </div>
  )
}