import type { MusicTrack } from '@shared/types'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import { useContextMenu } from '../../components/overlay'
import { MusicTrackRow, type TrackRowHandlers } from './music-track-row'
import { MusicTrackMenu, type TrackMenuTarget } from './music-track-menu'
import type { TrackSelection } from './use-track-list'

export const MusicTrackTable = memo(function MusicTrackTable({
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
  const selected = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds])
  const allSelected = tracks.length > 0 && tracks.every((track) => selected.has(track.id))
  const someSelected = tracks.some((track) => selected.has(track.id))

  const handleContextMenu = useCallback((event: React.MouseEvent, target: TrackMenuTarget) => {
    setMenuTarget(target)
    contextMenu.onContextMenu(event)
  }, [contextMenu])

  const closeMenu = useCallback(() => {
    setMenuTarget(null)
    contextMenu.close()
  }, [contextMenu])

  return (
    <div role='grid' aria-multiselectable='true' aria-label={t('music.tracks')} className='flex min-h-0 flex-1 flex-col'>
      <TableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleAll={() => (allSelected ? selection.clear() : selection.selectAll())}
      />
      <div role='rowgroup' className='min-h-0 flex-1 overflow-y-auto p-2'>
        {tracks.map((track, index) => (
          <MusicTrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrent={track.id === currentId}
            isPlaying={playback.isPlaying}
            isStreamLoading={playback.isStreamLoading}
            isSelected={selected.has(track.id)}
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
})

function TableHeader({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  // The header box shows a dash while only part of the visible list is selected.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected
  }, [allSelected, someSelected])
  return (
    <div role='row' className='flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2 pb-1.5 text-[length:var(--text-10)] font-medium tracking-[var(--tracking-label)] text-[var(--text-quaternary)] uppercase'>
      <span role='columnheader' className='flex w-6 shrink-0 items-center justify-center'>
        <input
          ref={ref}
          type='checkbox'
          checked={allSelected}
          onChange={onToggleAll}
          aria-label={t('music.select_all_tracks')}
          className='size-3.5 cursor-pointer accent-[var(--accent)]'
        />
      </span>
      <span role='columnheader' className='w-5 shrink-0 text-center'>{t('music.table_index')}</span>
      <span className='size-9 shrink-0' aria-hidden='true' />
      <span role='columnheader' className='min-w-0 flex-1'>{t('music.table_title')}</span>
      <span role='columnheader' className='hidden w-40 shrink-0 xl:block'>{t('music.table_album')}</span>
      <span role='columnheader' className='hidden w-16 shrink-0 sm:block'>{t('music.source')}</span>
      <span role='columnheader' className='w-11 shrink-0 text-right'>{t('music.table_duration')}</span>
      <span className='w-6 shrink-0' aria-hidden='true' />
      <span className='w-6 shrink-0' aria-hidden='true' />
    </div>
  )
}
