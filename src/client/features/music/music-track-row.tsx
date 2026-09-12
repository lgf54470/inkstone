import { memo, useCallback, useRef, useState } from 'react'
import { Heart, MoreHorizontal, Pause, Pin, Play } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { IconButton, Spinner } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { MusicArtwork } from './music-artwork'
import { MusicTrackMenu, type TrackMenuTarget } from './music-track-menu'
import { MusicSourceBadge } from './music-source-badge'
import { MusicTrackTags } from './music-track-tags'
import { formatDuration } from './music-utils'

// Off-screen rows skip layout and paint; the intrinsic size reserves their height.
const ROW_CONTAINMENT = { contentVisibility: 'auto', containIntrinsicSize: 'auto var(--sp-12)' } as const

export interface TrackRowHandlers {
  onPlay: (track: MusicTrack) => void
  onToggleFavorite: (id: string) => void
  onContextMenu: (event: React.MouseEvent, target: TrackMenuTarget) => void
  onEdit: (track: MusicTrack) => void
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

export const MusicTrackRow = memo(function MusicTrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  isStreamLoading,
  isSelected,
  handlers,
}: TrackRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const handleFavourite = useCallback(() => handlers.onToggleFavorite(track.id), [handlers, track.id])
  const label = isCurrent && isPlaying ? t('music.pause') : t('music.play')

  return (
    <div
      role='row'
      aria-current={isCurrent ? 'true' : undefined}
      onDoubleClick={() => handlers.onPlay(track)}
      onContextMenu={(event) => handlers.onContextMenu(event, { track })}
      style={ROW_CONTAINMENT}
      className={cn(
        'group/row flex h-12 items-center gap-2 rounded-[var(--r-md)] px-2 transition-colors',
        'hover:bg-[var(--bg-hover)]',
        isCurrent && 'bg-[var(--accent-soft)]',
        isSelected && 'ring-1 ring-[var(--accent)]',
      )}
    >
      <RowIndex index={index} isPlaying={isCurrent && isPlaying} />
      <RowArtwork
        track={track}
        label={label}
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        isStreamLoading={isStreamLoading}
        onPlay={() => handlers.onPlay(track)}
      />

      <TrackTitle track={track} isCurrent={isCurrent} onPlay={handlers.onPlay} />
      <span className='hidden w-40 shrink-0 truncate text-[length:var(--text-11)] text-[var(--text-quaternary)] xl:block'>
        {track.album || '—'}
      </span>
      <MusicSourceBadge source={track.source} className='hidden shrink-0 sm:inline-flex' />
      <span className='tabular w-11 shrink-0 text-right text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {formatDuration(track.durationMs)}
      </span>

      <RowActions
        isFavorite={track.isFavorite}
        menuRef={menuButtonRef}
        onToggleFavorite={handleFavourite}
        onOpenMenu={() => setIsMenuOpen(true)}
      />

      <MusicTrackMenu target={{ track }} anchor={menuButtonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} onEdit={handlers.onEdit} />
    </div>
  )
})

function RowIndex({ index, isPlaying }: { index: number; isPlaying: boolean }) {
  return (
    <span className='tabular w-5 shrink-0 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
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
    <button
      type='button'
      onClick={onPlay}
      aria-label={label + ': ' + track.title}
      className='group/art relative size-9 shrink-0 rounded-[var(--r-sm)]'
    >
      <MusicArtwork url={track.coverUrl} alt={track.title} className='size-9 rounded-[var(--r-sm)]' />
      <span className='absolute inset-0 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--scrim)] text-[var(--text-inverse)] opacity-0 transition-opacity group-hover/art:opacity-100 group-focus-visible/art:opacity-100'>
        {isStreamLoading && isCurrent ? <Spinner size={12} /> : isCurrent && isPlaying ? <Pause size={13} /> : <Play size={13} />}
      </span>
    </button>
  )
}

function RowActions({
  isFavorite,
  menuRef,
  onToggleFavorite,
  onOpenMenu,
}: {
  isFavorite: boolean
  menuRef: React.RefObject<HTMLButtonElement | null>
  onToggleFavorite: () => void
  onOpenMenu: () => void
}) {
  return (
    <>
      <IconButton
        label={isFavorite ? t('music.unfavorite') : t('music.favorite')}
        size='sm'
        onClick={onToggleFavorite}
        className={cn('opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100', isFavorite && 'opacity-100 text-[var(--accent)]')}
      >
        <Heart size={13} className={isFavorite ? 'fill-current' : undefined} />
      </IconButton>
      <IconButton
        ref={menuRef}
        label={t('music.open_menu')}
        size='sm'
        onClick={onOpenMenu}
        className='opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100'
      >
        <MoreHorizontal size={14} />
      </IconButton>
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
    <div className='flex min-w-0 flex-1 flex-col'>
      <button type='button' onClick={() => onPlay(track)} className='min-w-0 text-left'>
        <span className={cn('block truncate text-[length:var(--text-12\\.5)] font-medium', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
          {track.title}
        </span>
      </button>
      <div className='flex min-w-0 items-center gap-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {track.isPinned && <Pin size={10} className='shrink-0 fill-current text-[var(--warning)]' aria-hidden='true' />}
        <button type='button' onClick={() => onPlay(track)} className='min-w-0 shrink truncate text-left hover:text-[var(--text-secondary)]'>
          {track.artist || t('music.unknown_artist')}
        </button>
        <MusicTrackTags track={track} max={2} />
      </div>
    </div>
  )
}
