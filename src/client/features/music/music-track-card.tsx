import { Heart, MoreHorizontal, Pause, Pin, Play } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import { IconButton, Spinner } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { MusicArtwork } from './music-artwork'
import { MusicTrackMenu, type TrackMenuTarget } from './music-track-menu'
import { MusicSourceBadge } from './music-source-badge'
import { MusicTrackTags } from './music-track-tags'
import { formatDuration } from './music-utils'
import type { TrackRowProps } from './music-track-row'

function CardArtwork({
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
      className='group/art relative aspect-square w-full overflow-hidden rounded-[var(--r-md)]'
    >
      <MusicArtwork url={track.coverUrl} alt={track.title} className='size-full' iconSize={26} />
      <span className='absolute inset-0 flex items-center justify-center bg-[var(--scrim)] text-[var(--text-inverse)] opacity-0 transition-opacity group-hover/art:opacity-100 group-focus-visible/art:opacity-100'>
        {isStreamLoading && isCurrent ? <Spinner size={18} /> : isCurrent && isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </span>
      <span className='tabular absolute right-1.5 bottom-1.5 rounded-[var(--r-sm)] bg-[var(--scrim)] px-1 text-[length:var(--text-10)] text-[var(--text-inverse)]'>
        {formatDuration(track.durationMs)}
      </span>
    </button>
  )
}

function CardActions({
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
    <div className='absolute top-3 right-3 flex flex-col gap-1 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100'>
      <IconButton
        label={isFavorite ? t('music.unfavorite') : t('music.favorite')}
        size='sm'
        active={isFavorite}
        onClick={onToggleFavorite}
        className='bg-[var(--bg-overlay)] shadow-[var(--shadow-sm)]'
      >
        <Heart size={12} className={isFavorite ? 'fill-current' : undefined} />
      </IconButton>
      <IconButton
        ref={menuRef}
        label={t('music.open_menu')}
        size='sm'
        onClick={onOpenMenu}
        className='bg-[var(--bg-overlay)] shadow-[var(--shadow-sm)]'
      >
        <MoreHorizontal size={13} />
      </IconButton>
    </div>
  )
}

export const MusicTrackCard = memo(function MusicTrackCard({ track, isCurrent, isPlaying, isStreamLoading, isSelected, handlers }: TrackRowProps) {
  const menuTarget: TrackMenuTarget = { track }
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const label = isCurrent && isPlaying ? t('music.pause') : t('music.play')
  return (
    <div
      onDoubleClick={() => handlers.onPlay(track)}
      onContextMenu={(event) => handlers.onContextMenu(event, menuTarget)}
      className={cn(
        'group/card relative flex flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 transition-colors',
        'hover:border-[var(--border-default)] hover:shadow-[var(--shadow-soft)]',
        isCurrent && 'border-[var(--accent)] bg-[var(--accent-softer)]',
        isSelected && 'ring-1 ring-[var(--accent)]',
      )}
    >
      <CardArtwork
        track={track}
        label={label}
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        isStreamLoading={isStreamLoading}
        onPlay={() => handlers.onPlay(track)}
      />

      <div className='min-w-0 px-0.5'>
        <div className='flex items-center gap-1'>
          {track.isPinned && <Pin size={10} className='shrink-0 fill-current text-[var(--warning)]' aria-hidden='true' />}
          <span className={cn('truncate text-[length:var(--text-12)] font-medium', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
            {track.title}
          </span>
        </div>
        <span className='block truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {track.artist || t('music.unknown_artist')}
        </span>
        <MusicSourceBadge source={track.source} className='mt-1' />
        <MusicTrackTags track={track} max={4} className='mt-1 flex-wrap' />
      </div>

      <CardActions
        isFavorite={track.isFavorite}
        menuRef={menuButtonRef}
        onToggleFavorite={() => handlers.onToggleFavorite(track.id)}
        onOpenMenu={() => setIsMenuOpen(true)}
      />
      <MusicTrackMenu target={menuTarget} anchor={menuButtonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} onEdit={handlers.onEdit} />
    </div>
  )
})
