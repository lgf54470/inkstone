import { Heart, MoreHorizontal, Pause, Pin, Play } from 'lucide-react'
import { memo } from 'react'
import { IconButton, Spinner } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { REVEAL_ON_COARSE_POINTER } from './music-reveal'
import { durationCellText } from './music-utils'
import { MusicArtwork } from './music-artwork'
import type { TrackMenuTarget } from './music-track-menu'
import { MusicSourceBadge } from './music-source-badge'
import { MusicTrackTags } from './music-track-tags'
import { TrackCheckbox, type TrackRowProps } from './music-track-row'

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
      <span className='absolute inset-0 flex items-center justify-center bg-[var(--scrim)] text-[var(--text-primary)] opacity-0 transition-opacity group-hover/art:opacity-100 group-focus-visible/art:opacity-100'>
        {isStreamLoading && isCurrent ? <Spinner size={18} /> : isCurrent && isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </span>
      {/* FB2-C3: this pill is read against the picture it sits on, and a translucent scrim over a
          picture is a background no one can measure — axe reports it as "the element contains an image
          node", which made the contrast gate's verdict about the instance's data rather than the card.
          The card's own buttons already answer with an opaque overlay; the pill does too. */}
      <span className='tabular absolute right-[var(--sp-1\\.5)] bottom-[var(--sp-1\\.5)] rounded-[var(--r-sm)] bg-[var(--bg-overlay)] px-[var(--sp-1)] text-[length:var(--text-12)] text-[var(--text-primary)]'>
        {durationCellText(track.durationMs)}
      </span>
    </button>
  )
}

function CardActions({
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
  return (
    <div className={cn('opacity-100 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:opacity-100 md:group-focus-within/card:pointer-events-auto absolute top-[var(--sp-3)] right-[var(--sp-3)] flex flex-col gap-[var(--sp-1)]', REVEAL_ON_COARSE_POINTER)}>
      {/* `active` is what says the card is pinned (it is also the `aria-pressed` below). The overlay
          ground it is given here wins over the accent-soft one `active` would paint — deliberately:
          a control drawn on a cover needs a ground that reads against any artwork, while the row's
          pin sits on a solid surface and takes the accent-soft ground as it is. */}
      <IconButton
        label={isPinned ? t('music.unpin') : t('music.pin')}
        size='sm'
        active={isPinned}
        onClick={onTogglePin}
        className='bg-[var(--bg-overlay)] shadow-[var(--shadow-sm)]'
      >
        <Pin size={12} className={isPinned ? 'fill-current' : undefined} />
      </IconButton>
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

function CardSelectCheckbox({
  track,
  isSelected,
  onSelect,
}: {
  track: TrackRowProps['track']
  isSelected: boolean
  onSelect: TrackRowProps['handlers']['onSelect']
}) {
  return (
    <span className='absolute top-[var(--sp-3)] left-[var(--sp-3)] z-10 flex size-5 items-center justify-center rounded-[var(--r-xs)] bg-[var(--bg-overlay)] shadow-[var(--shadow-sm)]'>
      <TrackCheckbox
        checked={isSelected}
        label={t('music.select_track') + ': ' + track.title}
        onToggle={(event) => onSelect(track, { shift: event.shiftKey, additive: true })}
      />
    </span>
  )
}

function CardInfo({ track, isCurrent }: { track: TrackRowProps['track']; isCurrent: boolean }) {
  return (
    <div className='min-w-0 px-[var(--sp-0\\.5)]'>
      <div className='flex items-center gap-[var(--sp-1)]'>
        {track.isPinned && <Pin size={10} className='shrink-0 fill-current text-[var(--warning)]' aria-hidden='true' />}
        <span className={cn('truncate text-[length:var(--text-13)] font-medium', isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
          {track.title}
        </span>
      </div>
      <span className='block truncate text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
        {track.artist || t('music.unknown_artist')}
      </span>
      {/* FB-U4: the card is the narrow shape, and the album is the one thing the table's columns
          carried that it did not. Drawn only when there is one: a card is not a table cell, and a
          bare dash here would read as a value. */}
      {track.album && (
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{track.album}</span>
      )}
      <MusicSourceBadge source={track.source} className='mt-[var(--sp-1)]' />
      <MusicTrackTags track={track} max={4} className='mt-[var(--sp-1)] flex-wrap' />
    </div>
  )
}

export const MusicTrackCard = memo(function MusicTrackCard({ track, isCurrent, isPlaying, isStreamLoading, isSelected, handlers }: TrackRowProps) {
  const menuTarget: TrackMenuTarget = { track }
  const label = isCurrent && isPlaying ? t('music.pause') : t('music.play')
  return (
    <div
      // Selecting and playing live on the checkbox and the artwork button: a container that
      // answers clicks itself has no keyboard path and swallows the ones meant for its controls.
      role='group'
      aria-label={track.title}
      onContextMenu={(event) => handlers.onContextMenu(event, menuTarget)}
      className={cn(
        'group/card relative flex flex-col gap-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-[var(--sp-2)] transition-colors',
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
      <CardSelectCheckbox track={track} isSelected={isSelected} onSelect={handlers.onSelect} />
      <CardInfo track={track} isCurrent={isCurrent} />

      <CardActions
        isFavorite={track.isFavorite}
        isPinned={track.isPinned}
        onToggleFavorite={() => handlers.onToggleFavorite(track.id)}
        onTogglePin={() => handlers.onTogglePin(track.id)}
        onOpenMenu={(event) => handlers.onMenuButton(event, menuTarget)}
      />
    </div>
  )
})
