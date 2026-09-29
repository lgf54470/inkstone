import { memo, useCallback } from 'react'
import { Heart, MoreHorizontal, Pause, Pin, Play } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { IconButton, Spinner } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { REVEAL_ON_COARSE_POINTER } from './music-reveal'
import { durationCellText } from './music-utils'
import { MusicArtwork } from './music-artwork'
import type { TrackMenuTarget } from './music-track-menu'
import { MusicSourceBadge } from './music-source-badge'
import { MusicTrackTags } from './music-track-tags'

// Off-screen rows skip layout and paint; the intrinsic size reserves their height.
const ROW_CONTAINMENT = { contentVisibility: 'auto', containIntrinsicSize: 'auto var(--sp-12)' } as const

// The badge never wraps, so the column has to fit its longest label ("Cloud (R2)");
// the header cell and every row cell take this one budget so they cannot drift apart. The column is
// only drawn at all when the list has the width for it (FB-U4), so no responsive class here: the
// density decides, not a media query.
export const SOURCE_COLUMN_CELL = 'w-24 shrink-0'

// The place in the list and the control that plays it, side by side in one column. The header cell
// and every row take this one budget so the columns to their right line up down the table — the
// header used to sit at a narrower width than the rows, which shifted the title column by that much.
export const INDEX_COLUMN_CELL = 'w-10 shrink-0'

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
  onTogglePin: (id: string) => void
  onSelect: (track: MusicTrack, modifiers: { shift: boolean; additive: boolean }) => void
  onContextMenu: (event: React.MouseEvent, target: TrackMenuTarget) => void
  onMenuButton: (event: React.MouseEvent<HTMLElement>, target: TrackMenuTarget) => void
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
  /** FB-U4: the columns folded away, so the row says what they said — see `listDensity`. */
  compact?: boolean
}

// Selection, playback and the two favours all need the row's track, so they are made once here rather
// than as four inline arrows in the markup — the row is memoized, and stable callbacks keep the cells
// that take them from being redrawn with it.
function useRowHandlers(track: MusicTrack, handlers: TrackRowHandlers) {
  return {
    onPlay: useCallback(() => handlers.onPlay(track), [handlers, track]),
    onToggleFavorite: useCallback(() => handlers.onToggleFavorite(track.id), [handlers, track.id]),
    onTogglePin: useCallback(() => handlers.onTogglePin(track.id), [handlers, track.id]),
    onSelect: useCallback((event: React.MouseEvent) => {
      if (isInteractiveTarget(event.target)) return
      handlers.onSelect(track, { shift: event.shiftKey, additive: event.metaKey || event.ctrlKey })
    }, [handlers, track]),
  }
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
  compact = false,
}: TrackRowProps) {
  const { onPlay, onSelect, onToggleFavorite, onTogglePin } = useRowHandlers(track, handlers)
  const label = isCurrent && isPlaying ? t('music.pause') : t('music.play')

  return (
    <div
      role='row'
      aria-selected={isSelected}
      aria-current={isCurrent ? 'true' : undefined}
      onClick={onSelect}
      onDoubleClick={onPlay}
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
      <RowIndex index={index} label={label} title={track.title} isCurrent={isCurrent} isPlaying={isCurrent && isPlaying} onPlay={onPlay} />
      <RowArtwork
        track={track}
        label={label}
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        isStreamLoading={isStreamLoading}
        onPlay={onPlay}
      />

      <TrackTitle track={track} isCurrent={isCurrent} onPlay={onPlay} compact={compact} />
      {!compact && <RowArtist track={track} isCurrent={isCurrent} />}
      <RowMeta track={track} isCurrent={isCurrent} compact={compact} />
      <RowActions
        isFavorite={track.isFavorite}
        isPinned={track.isPinned}
        onToggleFavorite={onToggleFavorite}
        onTogglePin={onTogglePin}
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

function RowMeta({ track, isCurrent, compact }: { track: MusicTrack; isCurrent: boolean; compact: boolean }) {
  // The current row's 14% accent tint puts the dim tiers under AA (quaternary measures 4.08 in
  // light), so its cells take two tiers up while the row is current.
  const dim = isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]'
  return (
    <>
      {!compact && (
        <>
          <span role='cell' className={cn('w-40 shrink-0 truncate text-[length:var(--text-12)]', dim)}>
            {track.album || '—'}
          </span>
          <span role='cell' className={SOURCE_COLUMN_CELL}>
            <MusicSourceBadge source={track.source} className='inline-flex' />
          </span>
        </>
      )}
      <span
        role='cell'
        aria-label={track.durationMs > 0 ? undefined : t('music.duration_unknown')}
        className={cn('tabular w-11 shrink-0 text-right text-[length:var(--text-12)]', dim)}
      >
        {durationCellText(track.durationMs)}
      </span>
    </>
  )
}

function RowArtist({ track, isCurrent }: { track: MusicTrack; isCurrent: boolean }) {
  return (
    <span role='cell' className={cn('w-32 shrink-0 truncate text-[length:var(--text-12)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
      {track.artist || t('music.unknown_artist')}
    </span>
  )
}

// FB-U4: what the artist, album and source columns said, on one line under the title. The album is
// named on its own only when it exists; `—` belongs in a table cell, not in a sentence.
function RowSubstitute({ track }: { track: MusicTrack }) {
  return (
    <span className='flex min-w-0 items-center gap-1'>
      <span className='min-w-0 shrink truncate'>{track.artist || t('music.unknown_artist')}</span>
      {track.album && (
        <>
          <span aria-hidden='true'>·</span>
          <span className='min-w-0 shrink truncate'>{track.album}</span>
        </>
      )}
      <MusicSourceBadge source={track.source} className='shrink-0' />
    </span>
  )
}

// The number is the row's place in the list, so it stays where it is: the control that plays or pauses
// this row sits beside it instead of replacing it. Replacing it meant the one row a reader is most
// likely to look for — the one playing — was the only row without a number, and the only way to press
// play was a double click nothing announces. The space is reserved at every width so revealing the
// control never moves the number; the playing row keeps its own visible.
function RowIndex({ index, label, title, isCurrent, isPlaying, onPlay }: {
  index: number
  label: string
  title: string
  isCurrent: boolean
  isPlaying: boolean
  onPlay: () => void
}) {
  // Two states, spelled out rather than layered: the current row's control is simply drawn — pressed
  // to play it, pressed again to pause — and every other one is revealed by the row it belongs to
  // (hover, focus, or a coarse pointer that has no hover at all).
  const reveal = isCurrent
    ? 'opacity-100'
    : cn('opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto', REVEAL_ON_COARSE_POINTER)
  return (
    <span role='cell' className={cn(INDEX_COLUMN_CELL, 'flex items-center justify-center gap-0.5')}>
      <span className={cn('tabular w-4 text-right text-[length:var(--text-12)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
        {index + 1}
      </span>
      <IconButton
        label={label + ': ' + title}
        size='sm'
        onClick={onPlay}
        className={cn('transition-opacity', reveal, isPlaying && 'text-[var(--accent)]')}
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </IconButton>
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

// The row's two favours are one control twice: a toggle that stays drawn while it is on — hiding the
// control that says why the row is marked would hide the state — and that reports that state through
// `active` (`aria-pressed`), the way the card's pair already does. They share this component so the
// two cannot drift apart again: the odd one out was the favourite, which painted its own accent text
// and told a screen reader nothing about being on, while the pin beside it did both.
function RowToggle({
  label,
  active,
  reveal,
  onClick,
  children,
}: {
  label: string
  active: boolean
  reveal: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <span role='cell' className='flex w-6 shrink-0 items-center justify-center'>
      <IconButton
        label={label}
        size='sm'
        active={active}
        onClick={onClick}
        className={cn(reveal, active && 'md:opacity-100 md:pointer-events-auto')}
      >
        {children}
      </IconButton>
    </span>
  )
}

function RowActions({
  isFavorite,
  isPinned,
  onToggleFavorite,
  onTogglePin,
  onOpenMenu,
}: {
  isFavorite: boolean
  isPinned: boolean
  onToggleFavorite: () => void
  onTogglePin: () => void
  onOpenMenu: (event: React.MouseEvent<HTMLElement>) => void
}) {
  // Row action buttons stay visible on touch; only from md up do they reveal on hover/focus.
  const revealActions = cn('opacity-100 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/row:opacity-100 md:group-hover/row:pointer-events-auto md:group-focus-within/row:opacity-100 md:group-focus-within/row:pointer-events-auto', REVEAL_ON_COARSE_POINTER)
  return (
    <>
      <RowToggle label={isPinned ? t('music.unpin') : t('music.pin')} active={isPinned} reveal={revealActions} onClick={onTogglePin}>
        <Pin size={13} className={isPinned ? 'fill-current' : undefined} />
      </RowToggle>
      <RowToggle label={isFavorite ? t('music.unfavorite') : t('music.favorite')} active={isFavorite} reveal={revealActions} onClick={onToggleFavorite}>
        <Heart size={13} className={isFavorite ? 'fill-current' : undefined} />
      </RowToggle>
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
  compact,
}: {
  track: MusicTrack
  isCurrent: boolean
  onPlay: () => void
  compact: boolean
}) {
  return (
    <div role='cell' className='flex min-w-0 flex-1 flex-col'>
      <button type='button' onClick={onPlay} className='min-w-0 text-left'>
        <span className={cn('block truncate text-[length:var(--text-13)] font-medium', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
          {track.title}
        </span>
      </button>
      <div className={cn('flex min-w-0 items-center gap-1 text-[length:var(--text-12)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>
        {track.isPinned && <Pin size={10} className='shrink-0 fill-current text-[var(--warning)]' aria-hidden='true' />}
        {compact && <RowSubstitute track={track} />}
        <MusicTrackTags track={track} max={2} />
      </div>
    </div>
  )
}
