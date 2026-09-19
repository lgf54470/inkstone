import type { MusicTrack } from '@shared/types'
import { memo, useEffect, useMemo, useRef } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicSort } from './music-store'
import { MusicTrackRow, type TrackRowHandlers } from './music-track-row'
import type { TrackSelection } from './use-track-list'

export const MusicTrackTable = memo(function MusicTrackTable({
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
  const allSelected = tracks.length > 0 && tracks.every((track) => selected.has(track.id))
  const someSelected = tracks.some((track) => selected.has(track.id))

  return (
    <div role='table' aria-multiselectable='true' aria-label={t('music.tracks')} className='flex min-h-0 flex-1 flex-col'>
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
            handlers={handlers}
          />
        ))}
      </div>
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
      <span role='columnheader' className='size-9 shrink-0' />
      <SortableColumn field='title' label={t('music.table_title')} className='min-w-0 flex-1' />
      <SortableColumn field='artist' label={t('music.table_artist')} className='hidden w-32 shrink-0 truncate xl:block' />
      <SortableColumn field='album' label={t('music.table_album')} className='hidden w-40 shrink-0 truncate xl:block' />
      <span role='columnheader' className='hidden w-16 shrink-0 sm:block'>{t('music.source')}</span>
      <SortableColumn field='duration' label={t('music.table_duration')} className='w-11 shrink-0 text-right' />
      <span role='columnheader' className='w-6 shrink-0' />
      <span role='columnheader' className='w-6 shrink-0' />
    </div>
  )
}

// Header sorting mirrors the toolbar: in playlist scope the manual item order
// wins (visibleTracks skips sorting), so offering a sort there would be a dead control.
function SortableColumn({ field, label, className }: { field: MusicSort; label: string; className: string }) {
  const scope = useMusic((state) => state.scope)
  const sort = useMusic((state) => state.sort)
  const sortDirection = useMusic((state) => state.sortDirection)
  const setSort = useMusic((state) => state.setSort)
  const setSortDirection = useMusic((state) => state.setSortDirection)
  const sortable = scope.kind !== 'playlist'
  const active = sort === field
  const ariaSort = !sortable ? undefined : active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <span role='columnheader' aria-sort={ariaSort} className={className}>
      {sortable ? (
        <button
          type='button'
          className={cn('inline-flex cursor-pointer items-center gap-0.5 uppercase', active && 'text-[var(--accent)]')}
          onClick={() => (active ? setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') : setSort(field))}
        >
          {label}
          {active && (sortDirection === 'asc' ? <ArrowUp size={10} aria-hidden='true' /> : <ArrowDown size={10} aria-hidden='true' />)}
        </button>
      ) : (
        label
      )}
    </span>
  )
}
