import { memo, useCallback } from 'react'
import { Heart, MoreHorizontal, Pause, Pin, Play } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { IconButton, Spinner } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { MusicArtwork } from './music-artwork'
import type { TrackMenuTarget } from './music-track-menu'
import { MusicSourceBadge } from './music-source-badge'
import { MusicTrackTags } from './music-track-tags'
import { formatDuration } from './music-utils'

// Off-screen rows skip layout and paint; the intrinsic size reserves their height.
const ROW_CONTAINMENT = { contentVisibility: 'auto', containIntrinsicSize: 'auto var(--sp-12)' } as const

export interface TrackRowDragHandlers {
  onDragStart: (event: React.DragEvent, track: MusicTrack) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent, track: MusicTrack) => void
  onDragEnd: () => void
  isDragging: (track: MusicTrack) => boolean
}

export interface TrackRowHandlers {
  onPlay: (track: MusicTrack) => void
  onToggleFavorite: (id: string) => void
  onSelect: (track: MusicTrack, modifiers: { shift: boolean; additive: boolean }) => void
  onContextMenu: (event: React.MouseEvent, target: TrackMenuTarget) => void
  onMenuButton: (event: React.MouseEvent<HTMLElement>, target: TrackMenuTarget) => void
  onEdit: (track: MusicTrack) => void
  drag?: TrackRowDragHandlers
}

// Clicks on the row's own controls must not change the selection.
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="menu"]'))
}

export function TrackCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean
  label: string
  onToggle: (event: React.MouseEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type='checkbox'
      checked={checked}
      readOnly
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(event)
      }}
      className='size-3.5 shrink-0 cursor-pointer accent-[var(--accent)]'
    />
  )
}

export interface TrackRowProps {
  track: MusicTrack
  index: number
  isCurrent: boolean
  isPlaying: boolean
  isStreamLoading: boolean
  isSelected: boolean
  handlers: TrackRowHandlers
}

// Drag handlers all need the row's track; spreading keeps the row itself presentational.
function dragProps(drag: TrackRowDragHandlers | undefined, track: MusicTrack) {
  if (!drag) return { draggable: false as const }
  return {
    draggable: true as const,
    onDragStart: (event: React.DragEvent) => drag.onDragStart(event, track),
    onDragOver: drag.onDragOver,
    onDrop: (event: React.DragEvent) => drag.onDrop(event, track),
    onDragEnd: drag.onDragEnd,
  }
}

export const MusicTrackRow = memo(function MusicTrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  isStreamLoading,
  isSelected,
  handlers,
}: TrackRowProps) {
  const handleFavourite = useCallback(() => handlers.onToggleFavorite(track.id), [handlers, track.id])
  const handleSelect = useCallback((event: React.MouseEvent) => {
    if (isInteractiveTarget(event.target)) return
    handlers.onSelect(track, { shift: event.shiftKey, additive: event.metaKey || event.ctrlKey })
  }, [handlers, track])
  const label = isCurrent && isPlaying ? t('music.pause') : t('music.play')

  return (
    <div
      role='row'
      aria-selected={isSelected}
      aria-current={isCurrent ? 'true' : undefined}
      onClick={handleSelect}
      onDoubleClick={() => handlers.onPlay(track)}
      onContextMenu={(event) => handlers.onContextMenu(event, { track })}
      {...dragProps(handlers.drag, track)}
      style={ROW_CONTAINMENT}
      className={cn(
        'group/row flex h-12 cursor-default items-center gap-2 rounded-[var(--r-md)] px-2 transition-colors',
        'hover:bg-[var(--bg-hover)]',
        isCurrent && 'bg-[var(--accent-soft)]',
        isSelected && 'bg-[var(--accent-softer)] ring-1 ring-[var(--accent)]',
        handlers.drag?.isDragging(track) && 'opacity-40',
      )}
    >
      <RowSelectCell track={track} isSelected={isSelected} onSelect={handlers.onSelect} />
      <RowIndex index={index} isCurrent={isCurrent} isPlaying={isCurrent && isPlaying} />
      <RowArtwork
        track={track}
        label={label}
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        isStreamLoading={isStreamLoading}
        onPlay={() => handlers.onPlay(track)}
      />

      <TrackTitle track={track} isCurrent={isCurrent} onPlay={handlers.onPlay} />
      <RowArtist track={track} isCurrent={isCurrent} />
      <RowMeta track={track} isCurrent={isCurrent} />
      <RowActions
        isFavorite={track.isFavorite}
        onToggleFavorite={handleFavourite}
        onOpenMenu={(event) => handlers.onMenuButton(event, { track })}
      />
    </div>
  )
})

function RowSelectCell({
  track,
  isSelected,
  onSelect,
}: {
  track: MusicTrack
  isSelected: boolean
  onSelect: TrackRowHandlers['onSelect']
}) {
  return (
    <span role='cell' className='flex w-6 shrink-0 items-center justify-center'>
      <TrackCheckbox
        checked={isSelected}
        label={t('music.select_track') + ': ' + track.title}
        onToggle={(event) => onSelect(track, { shift: event.shiftKey, additive: true })}
      />
    </span>
  )
}

function RowMeta({ track, isCurrent }: { track: MusicTrack; isCurrent: boolean }) {
  // The current row's 14% accent tint puts the dim tiers under AA (quaternary measures 4.08 in
  // light), so its cells take two tiers up while the row is current.
  const dim = isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]'
  return (
    <>
      <span role='cell' className={cn('hidden w-40 shrink-0 truncate text-[length:var(--text-11)] xl:block', dim)}>
        {track.album || '—'}
      </span>
      <span role='cell' className='hidden w-16 shrink-0 sm:block'>
        <MusicSourceBadge source={track.source} className='inline-flex' />
      </span>
      <span role='cell' className={cn('tabular w-11 shrink-0 text-right text-[length:var(--text-11)]', dim)}>
        {formatDuration(track.durationMs)}
      </span>
    </>
  )
}

function RowArtist({ track, isCurrent }: { track: MusicTrack; isCurrent: boolean }) {
  return (
    <span role='cell' className={cn('hidden w-32 shrink-0 truncate text-[length:var(--text-11)] xl:block', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
      {track.artist || t('music.unknown_artist')}
    </span>
  )
}

function RowIndex({ index, isCurrent, isPlaying }: { index: number; isCurrent: boolean; isPlaying: boolean }) {
  return (
    <span role='cell' className={cn('tabular w-5 shrink-0 text-center text-[length:var(--text-11)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
      {isPlaying ? <Pause size={11} className='mx-auto text-[var(--accent)]' /> : index + 1}
    </span>
  )
}

function RowArtwork({
  track,
  label,
  isCurrent,
  isPlaying,
  isStreamLoading,
  onPlay,
}: {
  track: TrackRowProps['track']
  label: string
  isCurrent: boolean
  isPlaying: boolean
  isStreamLoading: boolean
  onPlay: () => void
}) {
  return (
    <span role='cell' className='size-9 shrink-0'>
      <button
        type='button'
        onClick={onPlay}
        aria-label={label + ': ' + track.title}
        className='group/art relative size-9 rounded-[var(--r-sm)]'
      >
        <MusicArtwork url={track.coverUrl} alt={track.title} className='size-9 rounded-[var(--r-sm)]' />
        <span className='absolute inset-0 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--scrim)] text-[var(--text-primary)] opacity-0 transition-opacity group-hover/art:opacity-100 group-focus-visible/art:opacity-100'>
          {isStreamLoading && isCurrent ? <Spinner size={12} /> : isCurrent && isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </span>
      </button>
    </span>
  )
}

function RowActions({
  isFavorite,
  onToggleFavorite,
  onOpenMenu,
}: {
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpenMenu: (event: React.MouseEvent<HTMLElement>) => void
}) {
  // Row action buttons stay visible on touch; only from md up do they reveal on hover/focus.
  const revealActions = 'opacity-100 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/row:opacity-100 md:group-hover/row:pointer-events-auto md:group-focus-within/row:opacity-100 md:group-focus-within/row:pointer-events-auto'
  return (
    <>
      <span role='cell' className='flex w-6 shrink-0 items-center justify-center'>
        <IconButton
          label={isFavorite ? t('music.unfavorite') : t('music.favorite')}
          size='sm'
          onClick={onToggleFavorite}
          className={cn(revealActions, isFavorite && 'md:opacity-100 md:pointer-events-auto text-[var(--accent)]')}
        >
          <Heart size={13} className={isFavorite ? 'fill-current' : undefined} />
        </IconButton>
      </span>
      <span role='cell' className='flex w-6 shrink-0 items-center justify-center'>
        <IconButton
          label={t('music.open_menu')}
          size='sm'
          onClick={onOpenMenu}
          className={revealActions}
        >
          <MoreHorizontal size={14} />
        </IconButton>
      </span>
    </>
  )
}

function TrackTitle({
  track,
  isCurrent,
  onPlay,
}: {
  track: MusicTrack
  isCurrent: boolean
  onPlay: (track: MusicTrack) => void
}) {
  return (
    <div role='cell' className='flex min-w-0 flex-1 flex-col'>
      <button type='button' onClick={() => onPlay(track)} className='min-w-0 text-left'>
        <span className={cn('block truncate text-[length:var(--text-12\\.5)] font-medium', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
          {track.title}
        </span>
      </button>
      <div className={cn('flex min-w-0 items-center gap-1 text-[length:var(--text-11)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
        {track.isPinned && <Pin size={10} className='shrink-0 fill-current text-[var(--warning)]' aria-hidden='true' />}
        <button type='button' onClick={() => onPlay(track)} className='min-w-0 shrink truncate text-left hover:text-[var(--text-secondary)] xl:hidden'>
          {track.artist || t('music.unknown_artist')}
        </button>
        <MusicTrackTags track={track} max={2} />
      </div>
    </div>
  )
}
