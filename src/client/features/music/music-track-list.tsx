import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Play, Shuffle } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { Button } from '../../components/primitives'
import { Empty, LoadingBlock } from '../../components/feedback'
import { useContextMenu, Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useMusic } from './music-store'
import type { MusicViewMode } from './music-store'
import { MusicSelectionBar } from './music-selection-bar'
import { MusicTrackCard } from './music-track-card'
import { MusicTrackMenu, type TrackMenuTarget } from './music-track-menu'
import { MusicTrackTable } from './music-track-table'
import type { TrackRowHandlers } from './music-track-row'
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
  const actions = useTrackListActions(tracks, currentId, onEdit)
  const visibleIds = useMemo(() => tracks.map((track) => track.id), [tracks])
  const selection = useTrackSelection(visibleIds)
  useSelectAllShortcut(selection.selectAll)
  const handlers: TrackRowHandlers = useMemo(
    () => ({
      ...actions,
      onSelect: (track, modifiers) => selection.toggle(track.id, modifiers),
      onContextMenu: () => undefined,
      onEdit,
    }),
    [actions, selection, onEdit],
  )
  const playback = useMemo(() => ({ isPlaying, isStreamLoading }), [isPlaying, isStreamLoading])

  if (loading && !tracks.length) return <LoadingBlock label={t('music.loading')} />
  if (!tracks.length) return <Empty art='search' title={emptyTitle} description={t('music.no_tracks_hint')} compact />

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ListHeader tracks={tracks} scopeKind={scope.kind} />
      <MusicSelectionBar visibleIds={visibleIds} />
      {viewMode === 'grid'
        ? <TrackGrid tracks={tracks} currentId={currentId} playback={playback} selection={selection} handlers={handlers} onEdit={onEdit} />
        : <MusicTrackTable tracks={tracks} currentId={currentId} playback={playback} selection={selection} handlers={handlers} onEdit={onEdit} />}
    </div>
  )
})

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
    <div role='radiogroup' aria-label={t('music.view_list')} className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-0.5'>
      {(['list', 'grid'] as const).map((mode) => (
        <button
          key={mode}
          type='button'
          role='radio'
          aria-checked={value === mode}
          aria-label={mode === 'list' ? t('music.view_list') : t('music.view_grid')}
          onClick={() => onChange(mode)}
          className={`rounded-[var(--r-sm)] px-2 py-0.5 text-[length:var(--text-11)] transition-colors ${value === mode ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
        >
          {mode === 'list' ? t('music.view_list') : t('music.view_grid')}
        </button>
      ))}
    </div>
  )
}

function TrackGrid({
  tracks,
  currentId,
  playback,
  selection,
  handlers,
  onEdit,
}: {
  tracks: MusicTrack[]
  currentId: string | null
  playback: { isPlaying: boolean; isStreamLoading: boolean }
  selection: TrackSelection
  handlers: TrackRowHandlers
  onEdit: (track: MusicTrack) => void
}) {
  const contextMenu = useContextMenu()
  const [menuTarget, setMenuTarget] = useState<TrackMenuTarget | null>(null)
  const handleContextMenu = useCallback((event: React.MouseEvent, target: TrackMenuTarget) => {
    setMenuTarget(target)
    contextMenu.onContextMenu(event)
  }, [contextMenu])
  const closeMenu = useCallback(() => {
    setMenuTarget(null)
    contextMenu.close()
  }, [contextMenu])
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
            isSelected={selection.selectedIds.includes(track.id)}
            handlers={{ ...handlers, onContextMenu: handleContextMenu }}
          />
        ))}
      </div>
      <MusicTrackMenu
        target={menuTarget}
        anchor={contextMenu.point ?? { x: 0, y: 0 }}
        open={Boolean(contextMenu.point) && Boolean(menuTarget)}
        onClose={closeMenu}
        onEdit={onEdit}
      />
    </div>
  )
}