import { useMemo, useRef, useState } from 'react'
import type { MusicSource, MusicTrack } from '@shared/types'
import { CloudDownload, HardDrive, ImageDown, ListPlus, Podcast, RefreshCw, RotateCw, Server, Upload, ClipboardList, Ellipsis, Link } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Menu, Tooltip, confirm } from '../../components/overlay'
import type { MenuItem } from '../../components/overlay'
import { useElementWidth, useMediaQuery } from '../../lib/hooks'
import { t, type MessageKey } from '../../lib/i18n'
import { toastMusicNotice } from './music-feedback'
import { matchM3uTracks, parseM3u } from './music-m3u'
import { MusicTextImportButton, TextImportDialog } from './music-text-import'
import { MusicUrlImportButton, UrlImportDialog } from './music-url-import'
import { MUSIC_TOOLBAR_INLINE_MIN_WIDTH, MUSIC_TOOLBAR_VIEWPORT_FALLBACK } from './music-utils'
import { SearchBox } from './music-search-box'
import { useMusic } from './music-store'
import type { MusicSort, MusicSourceFilter } from './music-store'

const SORT_OPTIONS: { value: MusicSort; label: 'music.sort_recent' | 'music.sort_title' | 'music.sort_artist' | 'music.sort_plays' }[] = [
  { value: 'recent', label: 'music.sort_recent' },
  { value: 'title', label: 'music.sort_title' },
  { value: 'artist', label: 'music.sort_artist' },
  { value: 'plays', label: 'music.sort_plays' },
]

export function MusicHubToolbar({ tracks, libraryTracks, onUpload, onBrowseWebdav, onBrowseAlist, onPodcasts }: {
  tracks: MusicTrack[]
  /** The whole library, not the filtered view: the filter's own options come from it. */
  libraryTracks: readonly Pick<MusicTrack, 'source'>[]
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onPodcasts: () => void
}) {
  // REF-7: the row folds on the width it is given, so the same toolbar unfolds again
  // when the hub is maximised instead of staying folded for a viewport it cannot see.
  const containerRef = useRef<HTMLDivElement>(null)
  const containerWidth = useElementWidth(containerRef)
  return (
    <div ref={containerRef} className='flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <SearchBox />
        <SourceFilter libraryTracks={libraryTracks} />
      </div>
      <ToolbarActions
        tracks={tracks}
        containerWidth={containerWidth}
        onUpload={onUpload}
        onBrowseWebdav={onBrowseWebdav}
        onBrowseAlist={onBrowseAlist}
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

// REF-7: the measured container decides; the viewport read is only the fallback for
// environments that cannot measure at all.
function useActionsFolded(containerWidth: number | null): boolean {
  const viewportWide = useMediaQuery(`(min-width: ${MUSIC_TOOLBAR_VIEWPORT_FALLBACK}px)`)
  return containerWidth === null ? !viewportWide : containerWidth < MUSIC_TOOLBAR_INLINE_MIN_WIDTH
}

// The four source flows carry the library's daily use, so they hold their place in the
// row at every width; only the imports and metadata jobs fold away (REF-2).
function PrimaryActions({ onUpload, onBrowseWebdav, onBrowseAlist, onPodcasts }: {
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onPodcasts: () => void
}) {
  return (
    <>
      <Button size='sm' variant='primary' icon={<Upload size={12} />} onClick={onUpload}>{t('music.upload')}</Button>
      <Button size='sm' icon={<Server size={12} />} onClick={onBrowseWebdav}>{t('music.webdav_title')}</Button>
      <Button size='sm' icon={<HardDrive size={12} />} onClick={onBrowseAlist}>{t('music.alist_title')}</Button>
      <Button size='sm' icon={<Podcast size={12} />} onClick={onPodcasts}>{t('music.podcast_title')}</Button>
    </>
  )
}

function ToolbarActions({ tracks, containerWidth, onUpload, onBrowseWebdav, onBrowseAlist, onPodcasts }: {
  tracks: MusicTrack[]
  containerWidth: number | null
  onUpload: () => void
  onBrowseWebdav: () => void
  onBrowseAlist: () => void
  onPodcasts: () => void
}) {
  const sort = useMusic((state) => state.sort)
  const loading = useMusic((state) => state.loading)
  const scope = useMusic((state) => state.scope)
  const setSort = useMusic((state) => state.setSort)
  const loadLibrary = useMusic((state) => state.loadLibrary)
  const folded = useActionsFolded(containerWidth)
  const fileRef = useRef<HTMLInputElement>(null)
  // Playlist scope shows the manual item order, so the sort control would change nothing;
  // the grouped browse grids sort their cards by name and ignore track sort entirely.
  const showSort = scope.kind !== 'playlist' && scope.kind !== 'albums' && scope.kind !== 'artists'
  return (
    <div className='flex min-w-0 items-center gap-2'>
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
      <PrimaryActions onUpload={onUpload} onBrowseWebdav={onBrowseWebdav} onBrowseAlist={onBrowseAlist} onPodcasts={onPodcasts} />
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
      {folded ? <FoldedActions tracks={tracks} onPickM3u={() => fileRef.current?.click()} /> : <InlineActions tracks={tracks} onPickM3u={() => fileRef.current?.click()} />}
      <Tooltip label={t('common.refresh')} side='left'>
        <IconButton label={t('common.refresh')} size='sm' disabled={loading} onClick={() => void loadLibrary(true)}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function InlineActions({ tracks, onPickM3u }: { tracks: MusicTrack[]; onPickM3u: () => void }) {
  return (
    <>
      <M3uImportButton onTrigger={onPickM3u} />
      <MusicTextImportButton tracks={tracks} />
      <MusicUrlImportButton />
      <MetadataButtons tracks={tracks} />
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
