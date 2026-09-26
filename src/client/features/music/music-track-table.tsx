import type { MusicTrack } from '@shared/types'
import { memo, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicSort } from './music-store'
import { MusicTrackRow, SOURCE_COLUMN_CELL, type TrackRowHandlers } from './music-track-row'
import type { TrackSelection } from './use-track-list'

// Rows are h-12 and the row group pads with p-2, so the window math is exact
// rather than measured: content height = rows * height + the two paddings.
export const TRACK_ROW_HEIGHT = 48
// Below this a window is bookkeeping without a payoff: a small library renders
// whole, and so do the jsdom fixtures that assert row-by-row structure.
const TRACK_WINDOW_THRESHOLD = 60
const TRACK_WINDOW_OVERSCAN = 10

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
  const windowed = tracks.length > TRACK_WINDOW_THRESHOLD
  const view = useRowWindow(tracks.length, windowed)
  const shown = windowed ? tracks.slice(view.start, view.end) : tracks

  return (
    <div role='table' aria-label={t('music.tracks')} aria-rowcount={tracks.length} className='flex min-h-0 flex-1 flex-col'>
      <TableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleAll={() => (allSelected ? selection.clear() : selection.selectAll())}
      />
      <div
        ref={view.ref}
        role='rowgroup'
        onScroll={windowed ? view.onScroll : undefined}
        className='min-h-0 flex-1 overflow-y-auto p-2'
      >
        {/* The spacers stand in for the rows the window leaves out, so the scroll
            bar describes the whole list even though only a slice is mounted. */}
        {windowed && view.start > 0 && <div style={{ height: view.start * TRACK_ROW_HEIGHT }} />}
        {shown.map((track, offset) => {
          const index = windowed ? view.start + offset : offset
          const isCurrent = track.id === currentId
          return (
            <MusicTrackRow
              key={track.id}
              track={track}
              index={index}
              isCurrent={isCurrent}
              // A row only ever shows transport state for the current track, so the
              // other rows keep a constant false and skip the render a pause triggers.
              isPlaying={isCurrent && playback.isPlaying}
              isStreamLoading={isCurrent && playback.isStreamLoading}
              isSelected={selected.has(track.id)}
              handlers={handlers}
            />
          )
        })}
        {windowed && view.end < tracks.length && <div style={{ height: (tracks.length - view.end) * TRACK_ROW_HEIGHT }} />}
      </div>
    </div>
  )
})

// The scroll window: rows near the playhead plus an overscan margin, so a wheel
// step always lands on rows that already exist. The viewport height arrives via
// ResizeObserver; until it does (or in jsdom) a minimal window still renders.
function useRowWindow(total: number, windowed: boolean): {
  ref: (node: HTMLDivElement | null) => void
  start: number
  end: number
  onScroll: (event: UIEvent<HTMLDivElement>) => void
} {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  const groupRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const group = groupRef.current
    if (!group || !windowed || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setViewport(group.clientHeight))
    observer.observe(group)
    return () => observer.disconnect()
  }, [windowed])
  const start = Math.max(0, Math.floor(scrollTop / TRACK_ROW_HEIGHT) - TRACK_WINDOW_OVERSCAN)
  const rows = viewport > 0 ? Math.ceil(viewport / TRACK_ROW_HEIGHT) + 2 * TRACK_WINDOW_OVERSCAN : TRACK_WINDOW_OVERSCAN
  return {
    ref: (node: HTMLDivElement | null) => { groupRef.current = node },
    start,
    end: Math.min(total, start + rows),
    onScroll: (event) => setScrollTop(event.currentTarget.scrollTop),
  }
}

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
      <ColumnSpacer className='size-9 shrink-0' />
      <SortableColumn field='title' label={t('music.table_title')} className='min-w-0 flex-1' />
      <SortableColumn field='artist' label={t('music.table_artist')} className='hidden w-32 shrink-0 truncate xl:block' />
      <SortableColumn field='album' label={t('music.table_album')} className='hidden w-40 shrink-0 truncate xl:block' />
      <span role='columnheader' className={SOURCE_COLUMN_CELL}>{t('music.source')}</span>
      <SortableColumn field='duration' label={t('music.table_duration')} className='w-11 shrink-0 text-right' />
      <ColumnSpacer className='w-6 shrink-0' />
      <ColumnSpacer className='w-6 shrink-0' />
    </div>
  )
}

// A row's children have to be cells, but these three columns (artwork, favourite, menu) carry
// nothing a screen reader could read — naming them would announce an empty header. They take the
// role and hide themselves: the grid stays legal and the accessibility tree stays clean.
function ColumnSpacer({ className }: { className: string }) {
  return <span role='columnheader' aria-hidden='true' className={className} />
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
