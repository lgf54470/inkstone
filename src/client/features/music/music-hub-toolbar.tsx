import { useMemo, useRef, useState, type RefObject } from 'react'
import type { MusicSource, MusicTrack } from '@shared/types'
import { Activity, Cloud, CloudDownload, HardDrive, ImageDown, ListPlus, Podcast, RefreshCw, RotateCw, Server, Upload, ClipboardList, Ellipsis, Link } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Segmented, Select } from '../../components/form'
import { Menu, Tooltip, confirm } from '../../components/overlay'
import type { MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { useElementWidth, useMediaQuery } from '../../lib/hooks'
import { t, type MessageKey } from '../../lib/i18n'
import { toastMusicNotice } from './music-feedback'
import { matchM3uTracks, parseM3u } from './music-m3u'
import { MusicTextImportButton, TextImportDialog } from './music-text-import'
import { MusicUrlImportButton, UrlImportDialog } from './music-url-import'
import { MUSIC_TOOLBAR_VIEWPORT_FALLBACK, toolbarShape, type MusicToolbarShape } from './music-utils'
import { SearchBox } from './music-search-box'
import { useMusic } from './music-store'
import type { MusicSort, MusicSourceFilter } from './music-store'

const SORT_OPTIONS: { value: MusicSort; label: 'music.sort_recent' | 'music.sort_title' | 'music.sort_artist' | 'music.sort_plays' }[] = [
  { value: 'recent', label: 'music.sort_recent' },
  { value: 'title', label: 'music.sort_title' },
  { value: 'artist', label: 'music.sort_artist' },
  { value: 'plays', label: 'music.sort_plays' },
]

export function MusicHubToolbar({ tracks, libraryTracks, shortViewport = false, onUpload, onBrowseWebdav, onBrowseAlist, onBrowseServers, onPodcasts }: {
  tracks: MusicTrack[]
  /** The whole library, not the filtered view: the filter's own options come from it. */
  libraryTracks: readonly Pick<MusicTrack, 'source'>[]
  /** FB-R3: the shell has no height to spare for a second row — see `toolbarShape`. */
  shortViewport?: boolean
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  /** FB-M16: the reader's own music server — search it and add what it holds. */
  onBrowseServers: () => void
  onPodcasts: () => void
}) {
  // REF-7: the row folds on the width it is given, so the same toolbar unfolds again
  // when the hub is maximised instead of staying folded for a viewport it cannot see.
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useElementWidth(containerRef)
  const viewportWide = useMediaQuery(`(min-width: ${MUSIC_TOOLBAR_VIEWPORT_FALLBACK}px)`)
  const shape = toolbarShape({ containerWidth, viewportWide, shortViewport })
  const fileRef = useRef<HTMLInputElement>(null)
  const pickM3u = (): void => fileRef.current?.click()
  return (
    <div
      ref={containerRef}
      data-music-toolbar=''
      data-shape={shape.stacked ? 'stacked' : shape.compact ? 'compact' : 'inline'}
      className='flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'
    >
      <div className={cn('flex min-w-0 items-center gap-2', shape.stacked && 'w-full')}>
        <SearchBox grow={shape.stacked} />
        {/* FB-U2: the stacked shape keeps the sort beside the search instead of in the menu the
            review suggested — the shared menu draws a checked row as `menuitemcheckbox`, which is
            multi-select semantics, while a native select keeps this a single choice and gets the
            keyboard model for free. It costs one row's width the search row has room for. */}
        {shape.stacked && <SortControl variant='select' />}
        {!shape.compact && <SourceFilter libraryTracks={libraryTracks} />}
        {shape.stacked && (
          <>
            <RefreshButton />
            <FoldedActions tracks={tracks} onPickM3u={pickM3u} />
          </>
        )}
      </div>
      <ToolbarActions
        tracks={tracks}
        libraryTracks={libraryTracks}
        shape={shape}
        fileRef={fileRef}
        onPickM3u={pickM3u}
        onUpload={onUpload}
        onBrowseWebdav={onBrowseWebdav}
        onBrowseAlist={onBrowseAlist}
        onBrowseServers={onBrowseServers}
        onPodcasts={onPodcasts}
      />
    </div>
  )
}

// FB-F3: the filter follows the library rather than a fixed pair that predates the
// reference sources — alist / external / provider rows used to be unfilterable while the
// source badge already knew their names. The order is canonical, so the row does not
// reshuffle as the library grows, and the options come from the whole library rather than
// the filtered view: deriving them from what is on screen would remove every way back.
const SOURCE_FILTER_ORDER: MusicSource[] = ['r2', 'webdav', 'alist', 'external', 'provider']

const SOURCE_FILTER_KEYS: Record<MusicSourceFilter, MessageKey> = {
  all: 'music.source_all',
  r2: 'music.source_r2',
  webdav: 'music.source_webdav',
  alist: 'music.source_alist',
  external: 'music.source_external',
  provider: 'music.source_online',
}

export function buildSourceFilterOptions(
  tracks: readonly Pick<MusicTrack, 'source'>[],
  include: readonly MusicSourceFilter[] = [],
): MusicSourceFilter[] {
  // A filter restored from a preference whose rows are all gone still has to be visible:
  // dropping it from the row would leave an active filter with no control to clear it.
  const present = new Set<MusicSourceFilter>([
    ...tracks.map((track) => track.source),
    ...include.filter((value) => value !== 'all'),
  ])
  return ['all', ...SOURCE_FILTER_ORDER.filter((source) => present.has(source))]
}

function SourceFilter({ libraryTracks }: { libraryTracks: readonly Pick<MusicTrack, 'source'>[] }) {
  const sourceFilter = useMusic((state) => state.sourceFilter)
  const setSourceFilter = useMusic((state) => state.setSourceFilter)
  const options = useMemo(
    () => buildSourceFilterOptions(libraryTracks, [sourceFilter]).map((value) => ({ value, label: t(SOURCE_FILTER_KEYS[value]) })),
    [libraryTracks, sourceFilter],
  )
  return (
    <Segmented
      label={t('music.source_filter')}
      size='sm'
      value={sourceFilter}
      onChange={setSourceFilter}
      options={options}
    />
  )
}

// FB-U2: the same filter as a dropdown. A segmented row of sources is a control per source — the
// thing that wrapped into lines at phone width — while a select keeps its name, its value and its
// keyboard behaviour in one 120px control whatever the library holds.
function SourceFilterSelect({ libraryTracks }: { libraryTracks: readonly Pick<MusicTrack, 'source'>[] }) {
  const sourceFilter = useMusic((state) => state.sourceFilter)
  const setSourceFilter = useMusic((state) => state.setSourceFilter)
  const options = useMemo(
    () => buildSourceFilterOptions(libraryTracks, [sourceFilter]),
    [libraryTracks, sourceFilter],
  )
  return (
    <Select
      aria-label={t('music.source_filter')}
      className='h-8 w-30'
      value={sourceFilter}
      onChange={(event) => setSourceFilter(event.target.value as MusicSourceFilter)}
    >
      {options.map((value) => <option key={value} value={value}>{t(SOURCE_FILTER_KEYS[value])}</option>)}
    </Select>
  )
}

// FB-U2: the sort row answered the squeeze with four more segments; as a dropdown it is one control,
// and its options are the same list the segments were built from. Both shapes read the store here, so
// neither of them has to know that a playlist's manual order has nothing to sort.
function SortControl({ variant }: { variant: 'select' | 'segmented' }) {
  const sort = useMusic((state) => state.sort)
  const scope = useMusic((state) => state.scope)
  const setSort = useMusic((state) => state.setSort)
  // Playlist scope shows the manual item order, so the sort control would change nothing;
  // the grouped browse grids sort their cards by name and ignore track sort entirely.
  if (scope.kind === 'playlist' || scope.kind === 'albums' || scope.kind === 'artists') return null
  if (variant === 'select') {
    return (
      <Select
        aria-label={t('music.sort')}
        className='h-8 w-30'
        value={sort}
        onChange={(event) => setSort(event.target.value as MusicSort)}
      >
        {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
      </Select>
    )
  }
  return (
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
  )
}

// FB-U2: its own component so the stacked shape can keep the refresh beside the search, where a
// second row would otherwise be spent on it.
function RefreshButton() {
  const loading = useMusic((state) => state.loading)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  return (
    <Tooltip label={t('common.refresh')} side='left'>
      <IconButton label={t('common.refresh')} size='sm' disabled={loading} onClick={() => void loadLibrary(true)}>
        <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
      </IconButton>
    </Tooltip>
  )
}

// The five source flows carry the library's daily use, so they hold their place in the
// row at every width; only the imports and metadata jobs fold away (REF-2). FB-U2 drops
// their labels at the compact widths — the name stays on the control, so the press and the
// screen reader answer are the same ones.
function PrimaryActions({ shape, onUpload, onBrowseWebdav, onBrowseAlist, onBrowseServers, onPodcasts }: {
  shape: MusicToolbarShape
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onBrowseServers: () => void
  onPodcasts: () => void
}) {
  if (shape.compact) {
    return (
      <>
        <Tooltip label={t('music.upload')} side='top'>
          <IconButton label={t('music.upload')} size='sm' active onClick={onUpload}><Upload size={14} /></IconButton>
        </Tooltip>
        <Tooltip label={t('music.webdav_title')} side='top'>
          <IconButton label={t('music.webdav_title')} size='sm' onClick={onBrowseWebdav}><Server size={14} /></IconButton>
        </Tooltip>
        <Tooltip label={t('music.alist_title')} side='top'>
          <IconButton label={t('music.alist_title')} size='sm' onClick={onBrowseAlist}><HardDrive size={14} /></IconButton>
        </Tooltip>
        <Tooltip label={t('music.server_title')} side='top'>
          <IconButton label={t('music.server_title')} size='sm' onClick={onBrowseServers}><Cloud size={14} /></IconButton>
        </Tooltip>
        <Tooltip label={t('music.podcast_title')} side='top'>
          <IconButton label={t('music.podcast_title')} size='sm' onClick={onPodcasts}><Podcast size={14} /></IconButton>
        </Tooltip>
      </>
    )
  }
  return (
    <>
      <Button size='sm' variant='primary' icon={<Upload size={12} />} onClick={onUpload}>{t('music.upload')}</Button>
      <Button size='sm' icon={<Server size={12} />} onClick={onBrowseWebdav}>{t('music.webdav_title')}</Button>
      <Button size='sm' icon={<HardDrive size={12} />} onClick={onBrowseAlist}>{t('music.alist_title')}</Button>
      <Button size='sm' icon={<Cloud size={12} />} onClick={onBrowseServers}>{t('music.server_title')}</Button>
      <Button size='sm' icon={<Podcast size={12} />} onClick={onPodcasts}>{t('music.podcast_title')}</Button>
    </>
  )
}

function ToolbarActions({ tracks, libraryTracks, shape, fileRef, onPickM3u, onUpload, onBrowseWebdav, onBrowseAlist, onBrowseServers, onPodcasts }: {
  tracks: MusicTrack[]
  libraryTracks: readonly Pick<MusicTrack, 'source'>[]
  shape: MusicToolbarShape
  fileRef: RefObject<HTMLInputElement | null>
  onPickM3u: () => void
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onBrowseServers: () => void
  onPodcasts: () => void
}) {
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      {shape.compact && <SourceFilterSelect libraryTracks={libraryTracks} />}
      {shape.compact && !shape.stacked && <SortControl variant='select' />}
      {!shape.compact && <SortControl variant='segmented' />}
      <PrimaryActions shape={shape} onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} onBrowseAlist={onBrowseAlist} onBrowseServers={onBrowseServers} onPodcasts={onPodcasts} />
      <input
        ref={fileRef}
        type='file'
        accept='.m3u,.m3u8,audio/x-mpegurl'
        className='hidden'
        onChange={(event) => {
          void importM3uFile(event.target.files?.[0], tracks)
          event.target.value = ''
        }}
      />
      {/* FB-U2: the stacked shape draws the menu and the refresh beside the search, one row up. */}
      {!shape.stacked && (shape.folded ? <FoldedActions tracks={tracks} onPickM3u={onPickM3u} /> : <InlineActions tracks={tracks} onPickM3u={onPickM3u} />)}
      {!shape.stacked && <RefreshButton />}
    </div>
  )
}

function InlineActions({ tracks, onPickM3u }: { tracks: MusicTrack[]; onPickM3u: () => void }) {
  const healthScanning = useMusic((state) => state.healthScanning)
  return (
    <>
      <M3uImportButton onTrigger={onPickM3u} />
      <MusicTextImportButton tracks={tracks} />
      <MusicUrlImportButton />
      <MetadataButtons tracks={tracks} />
      {/* FB-F9: the library health scan — a library-wide action, so it lives with the other
          library-wide actions rather than behind the delete menu of a single row. */}
      <Tooltip label={t('music.health_scan')} side='left'>
        <IconButton
          label={t('music.health_scan')}
          size='sm'
          onClick={() => void useMusic.getState().openHealthScan()}
        >
          <Activity size={14} className={healthScanning ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
    </>
  )
}

// REF-2: a narrow container folds the low-frequency actions into a "more" menu
// instead of letting the row wrap mid-label; the primary flows stay inline.
function FoldedActions({ tracks, onPickM3u }: { tracks: MusicTrack[]; onPickM3u: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const metadata = useMetadataActions(tracks)
  const items: MenuItem[] = [
    { id: 'import-m3u', label: t('music.import_m3u'), icon: <ListPlus size={13} />, onSelect: onPickM3u },
    { id: 'import-text', label: t('music.import_text'), icon: <ClipboardList size={13} />, onSelect: () => setTextOpen(true) },
    { id: 'import-url', label: t('music.import_url'), icon: <Link size={13} />, onSelect: () => setUrlOpen(true) },
    { id: 'metadata-scan', label: t('music.refresh_metadata'), icon: <ImageDown size={13} />, disabled: metadata.scanDisabled, onSelect: metadata.scan },
    { id: 'metadata-force', label: t('music.metadata_force'), icon: <RotateCw size={13} />, disabled: metadata.forceDisabled, onSelect: metadata.forceScan },
    { id: 'metadata-covers', label: t('music.match_covers'), icon: <CloudDownload size={13} />, disabled: metadata.coversDisabled, onSelect: metadata.matchCovers },
    { id: 'health-scan', label: t('music.health_scan'), icon: <Activity size={13} />, separatorBefore: true, onSelect: () => void useMusic.getState().openHealthScan() },
  ]
  return (
    <>
      <Tooltip label={t('music.more_actions')} side='left'>
        <IconButton
          ref={moreRef}
          label={t('music.more_actions')}
          size='sm'
          active={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Ellipsis size={14} />
        </IconButton>
      </Tooltip>
      <Menu anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} align='end' label={t('music.more_actions')} items={items} />
      <TextImportDialog open={textOpen} tracks={tracks} onClose={() => setTextOpen(false)} />
      <UrlImportDialog open={urlOpen} onClose={() => setUrlOpen(false)} />
    </>
  )
}

// An exported playlist should be able to come back: the file names a target next to
// each entry, and the library answers the ones it recognises. What it cannot answer
// is reported rather than dropped.
async function importM3uFile(file: File | undefined, tracks: MusicTrack[]): Promise<void> {
  if (!file) return
  const entries = parseM3u(await file.text())
  if (!entries.length) {
    toastMusicNotice('music.m3u_imported_none')
    return
  }
  const matched = matchM3uTracks(entries, tracks)
  useMusic.getState().addManyToQueue(matched.map((track) => track.id))
  const unmatched = entries.length - matched.length
  if (unmatched > 0) {
    toastMusicNotice('music.m3u_imported_partial', { value0: entries.length, value1: unmatched })
  }
}

function M3uImportButton({ onTrigger }: { onTrigger: () => void }) {
  return <Button size='sm' icon={<ListPlus size={12} />} onClick={onTrigger}>{t('music.import_m3u')}</Button>
}

function useMetadataActions(tracks: MusicTrack[]) {
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
  return {
    scanning,
    matching,
    scanDisabled: !missingIds.length || scanning,
    forceDisabled: !tracks.length || scanning,
    coversDisabled: !coverlessCount || matching,
    scan,
    forceScan,
    matchCovers,
  }
}

function MetadataButtons({ tracks }: { tracks: MusicTrack[] }) {
  const metadata = useMetadataActions(tracks)
  return (
    <>
      <Tooltip label={t('music.refresh_metadata')} side='left'>
        <IconButton label={t('music.refresh_metadata')} size='sm' disabled={metadata.scanDisabled} onClick={metadata.scan}>
          <ImageDown size={14} className={metadata.scanning ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.metadata_force')} side='left'>
        <IconButton label={t('music.metadata_force')} size='sm' disabled={metadata.forceDisabled} onClick={metadata.forceScan}>
          <RotateCw size={14} className={metadata.scanning ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.match_covers')} side='left'>
        <IconButton label={t('music.match_covers')} size='sm' disabled={metadata.coversDisabled} onClick={metadata.matchCovers}>
          <CloudDownload size={14} className={metadata.matching ? 'animate-pulse' : undefined} />
        </IconButton>
      </Tooltip>
    </>
  )
}
