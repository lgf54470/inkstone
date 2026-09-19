import { memo, useEffect, useMemo, useState } from 'react'
import { Download, Play, Shuffle } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { Button } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Empty, LoadingBlock } from '../../components/feedback'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useMusic } from './music-store'
import type { MusicViewMode } from './music-store'
import { MusicSelectionBar } from './music-selection-bar'
import { MusicTrackCard } from './music-track-card'
import { MusicTrackMenuHost } from './music-track-menu'
import { MusicTrackTable } from './music-track-table'
import type { TrackRowDragHandlers, TrackRowHandlers } from './music-track-row'
import { useTrackListActions, useTrackSelection, shuffledIds, type TrackSelection } from './use-track-list'
import { downloadM3u } from './music-export'

export const MusicTrackList = memo(function MusicTrackList({
  tracks,
  loading,
  emptyTitle,
  onEdit,
}: {
  tracks: MusicTrack[]
  loading: boolean
  emptyTitle: string
  onEdit: (track: MusicTrack) => void
}) {
  const currentId = useMusic((state) => state.queue[state.currentIndex] ?? null)
  const isPlaying = useMusic((state) => state.isPlaying)
  const isStreamLoading = useMusic((state) => state.streamLoading)
  const viewMode = useMusic((state) => state.viewMode)
  const scope = useMusic((state) => state.scope)
  const query = useMusic((state) => state.query)
  const setQuery = useMusic((state) => state.setQuery)
  const openTrackMenu = useMusic((state) => state.openTrackMenu)
  const actions = useTrackListActions(tracks, currentId, onEdit)
  const playlistDrag = usePlaylistDrag()
  const visibleIds = useMemo(() => tracks.map((track) => track.id), [tracks])
  const selection = useTrackSelection(visibleIds)
  useSelectAllShortcut(selection.selectAll)
  const handlers: TrackRowHandlers = useMemo(
    () => ({
      ...actions,
      onSelect: (track, modifiers) => selection.toggle(track.id, modifiers),
      // The menu itself is a single hub-wide instance; rows only post these requests.
      onContextMenu: (event, target) => {
        event.preventDefault()
        event.stopPropagation()
        openTrackMenu({ target, anchor: { x: event.clientX, y: event.clientY } })
      },
      onMenuButton: (event, target) => openTrackMenu({ target, anchor: event.currentTarget }),
      onEdit,
      drag: playlistDrag,
    }),
    [actions, selection, onEdit, openTrackMenu, playlistDrag],
  )
  const playback = useMemo(() => ({ isPlaying, isStreamLoading }), [isPlaying, isStreamLoading])

  if (loading && !tracks.length) return <LoadingBlock label={t('music.loading')} />
  if (!tracks.length) return <NoTracks emptyTitle={emptyTitle} query={query} onClearQuery={() => setQuery('')} />

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ListHeader tracks={tracks} scopeKind={scope.kind} />
      <MusicSelectionBar visibleIds={visibleIds} />
      {viewMode === 'grid'
        ? <TrackGrid tracks={tracks} currentId={currentId} playback={playback} selection={selection} handlers={handlers} />
        : <MusicTrackTable tracks={tracks} currentId={currentId} playback={playback} selection={selection} handlers={handlers} />}
      <MusicTrackMenuHost onEdit={onEdit} />
    </div>
  )
})

// A search that matched nothing is not an empty library; offer the way back rather than the upload pitch.
function NoTracks({ emptyTitle, query, onClearQuery }: { emptyTitle: string; query: string; onClearQuery: () => void }) {
  if (query.trim()) {
    return (
      <Empty
        art='search'
        title={t('music.no_results')}
        description={t('music.search_results', { value0: query.trim() })}
        action={<Button size='sm' onClick={onClearQuery}>{t('music.search_clear')}</Button>}
        compact
      />
    )
  }
  return <Empty art='search' title={emptyTitle} description={t('music.no_tracks_hint')} compact />
}

// Inside a playlist the rows can be dragged onto each other; the manual order
// is the only order there, so the drop maps to an index in the stored items.
function usePlaylistDrag(): TrackRowDragHandlers | undefined {
  const scope = useMusic((state) => state.scope)
  const playlists = useMusic((state) => state.playlists)
  const movePlaylistItemToIndex = useMusic((state) => state.movePlaylistItemToIndex)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const playlistId = scope.kind === 'playlist' ? scope.playlistId : null
  const items = useMemo(
    () => playlists.find((playlist) => playlist.id === playlistId)?.items ?? [],
    [playlists, playlistId],
  )
  return useMemo(() => {
    if (!playlistId) return undefined
    const itemIdByTrack = new Map(items.map((item) => [item.trackId, item.id]))
    const orderedIds = [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id)
    return {
      onDragStart: (event, track) => {
        const itemId = itemIdByTrack.get(track.id)
        if (!itemId) return
        event.dataTransfer.setData('text/plain', itemId)
        event.dataTransfer.effectAllowed = 'move'
        setDraggedItemId(itemId)
      },
      onDragOver: (event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      },
      onDrop: (event, track) => {
        event.preventDefault()
        const source = event.dataTransfer.getData('text/plain') || draggedItemId
        setDraggedItemId(null)
        const target = itemIdByTrack.get(track.id)
        if (!source || !target || source === target) return
        void movePlaylistItemToIndex(playlistId, source, orderedIds.indexOf(target))
      },
      onDragEnd: () => setDraggedItemId(null),
      isDragging: (track) => itemIdByTrack.get(track.id) === draggedItemId,
    }
  }, [playlistId, items, draggedItemId, movePlaylistItemToIndex])
}

// Ctrl/Cmd+A selects the visible list, matching the file-manager habit; text fields keep their own.
function useSelectAllShortcut(selectAll: () => void): void {
  const panel = useUi((state) => state.panel)
  useEffect(() => {
    if (panel !== 'music-hub') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      selectAll()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel, selectAll])
}

function ListHeader({ tracks, scopeKind }: { tracks: MusicTrack[]; scopeKind: string }) {
  const playCollection = useMusic((state) => state.playCollection)
  const viewMode = useMusic((state) => state.viewMode)
  const setViewMode = useMusic((state) => state.setViewMode)
  const ids = tracks.map((track) => track.id)
  return (
    <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2'>
      <Button size='sm' variant='primary' icon={<Play size={13} />} onClick={() => void playCollection(ids)}>
        {t('music.play_all')}
      </Button>
      <Button size='sm' icon={<Shuffle size={13} />} onClick={() => void playCollection(shuffledIds(ids))}>
        {t('music.shuffle_all')}
      </Button>
      {scopeKind !== 'recent' && (
        <Tooltip label={t('music.export_m3u')} side='top'>
          <Button size='sm' icon={<Download size={13} />} onClick={() => downloadM3u(tracks, 'inkstone-playlist')}>
            {t('music.export_m3u')}
          </Button>
        </Tooltip>
      )}
      <span className='ml-auto text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {t('music.playlist_track_count', { value0: tracks.length })}
      </span>
      <ViewModeToggle value={viewMode} onChange={setViewMode} />
    </div>
  )
}

function ViewModeToggle({ value, onChange }: { value: MusicViewMode; onChange: (mode: MusicViewMode) => void }) {
  return (
    <Segmented
      label={t('music.view_mode')}
      size='sm'
      value={value}
      onChange={onChange}
      options={[
        { value: 'list' as const, label: t('music.view_list') },
        { value: 'grid' as const, label: t('music.view_grid') },
      ]}
    />
  )
}

function TrackGrid({
  tracks,
  currentId,
  playback,
  selection,
  handlers,
}: {
  tracks: MusicTrack[]
  currentId: string | null
  playback: { isPlaying: boolean; isStreamLoading: boolean }
  selection: TrackSelection
  handlers: TrackRowHandlers
}) {
  const selected = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds])
  return (
    <div className='min-h-0 flex-1 overflow-y-auto p-3'>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'>
        {tracks.map((track) => (
          <MusicTrackCard
            key={track.id}
            track={track}
            index={0}
            isCurrent={track.id === currentId}
            isPlaying={playback.isPlaying}
            isStreamLoading={playback.isStreamLoading}
            isSelected={selected.has(track.id)}
            handlers={handlers}
          />
        ))}
      </div>
    </div>
  )
}