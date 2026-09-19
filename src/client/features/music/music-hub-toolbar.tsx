import type { MusicTrack } from '@shared/types'
import { CloudDownload, ImageDown, RefreshCw, RotateCw, Server, Upload } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Tooltip, confirm } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { SearchBox } from './music-search-box'
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

function ToolbarActions({ onUpload, onBrowseWebdav }: { onUpload: () => void; onBrowseWebdav: () => void }) {
  const sort = useMusic((state) => state.sort)
  const loading = useMusic((state) => state.loading)
  const scope = useMusic((state) => state.scope)
  const setSort = useMusic((state) => state.setSort)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const tracks = useVisibleTracks()
  // Playlist scope shows the manual item order, so the sort control would change nothing.
  const showSort = scope.kind !== 'playlist'
  return (
    <div className='flex items-center gap-2'>
      {showSort && (
        <>
          <Segmented
            label={t('music.sort')}
            size='sm'
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
          />
          <span className='h-4 w-px bg-[var(--border-subtle)]' />
        </>
      )}
      <Button size='sm' variant='primary' icon={<Upload size={12} />} onClick={onUpload}>{t('music.upload')}</Button>
      <Button size='sm' icon={<Server size={12} />} onClick={onBrowseWebdav}>{t('music.webdav_title')}</Button>
      <Tooltip label={t('common.refresh')} side='left'>
        <IconButton label={t('common.refresh')} size='sm' disabled={loading} onClick={() => void loadLibrary(true)}>
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
  // The running guard lives in the store, so remounting the toolbar cannot stack a second pass.
  const scanning = useMusic((state) => state.libraryJobs.some((job) => job.kind === 'metadata' && job.status === 'running'))
  const matching = useMusic((state) => state.libraryJobs.some((job) => job.kind === 'covers' && job.status === 'running'))
  const missingIds = tracks.filter((track) => !track.coverUrl || (!track.hasLyric && !track.lyric) || track.durationMs === 0).map((track) => track.id)
  const coverlessCount = tracks.filter((track) => !track.coverUrl).length
  const scan = (): void => {
    if (missingIds.length) void refreshTrackMetadata(missingIds)
  }
  const matchCovers = (): void => {
    if (coverlessCount) void matchMissingCovers()
  }
  // Force mode overwrites stored tags, so manual edits are lost — confirm before scanning everything visible.
  const forceScan = (): void => {
    void confirm({
      title: t('music.metadata_force'),
      description: t('music.metadata_force_confirm'),
      confirmLabel: t('music.metadata_force'),
      tone: 'danger',
    }).then((ok) => {
      if (ok) void refreshTrackMetadata(tracks.map((track) => track.id), true)
    })
  }
  return (
    <>
      <Tooltip label={t('music.refresh_metadata')} side='left'>
        <IconButton label={t('music.refresh_metadata')} size='sm' disabled={!missingIds.length || scanning} onClick={scan}>
          <ImageDown size={14} className={scanning ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.metadata_force')} side='left'>
        <IconButton label={t('music.metadata_force')} size='sm' disabled={!tracks.length || scanning} onClick={forceScan}>
          <RotateCw size={14} className={scanning ? 'animate-pulse' : undefined} />
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
