import { useRef, useState } from 'react'
import { Ellipsis, Heart, ListMusic, Maximize2, PictureInPicture2, Pin, Volume2 } from 'lucide-react'
import { MusicEqButton, MusicLoopButton, MusicModeButton, MusicRateButton, MusicSleepButton, MusicVolumeButton, MusicVolumeSlider } from './music-transport-widgets'
import type { MusicTrack } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip } from '../../components/overlay'
import type { MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { useElementWidth } from '../../lib/hooks'
import { t } from '../../lib/i18n'
import { useActiveLoopRange, useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicSeekBar } from './music-seek-bar'

// REF-8: the bar was one rigid row — a 208px summary plus nine controls (144px of them a
// volume slider) inside the hub's ~760px centre column, which left the seek bar a few
// dozen pixels wide. It sheds the widest pieces first: the slider becomes a button, then
// the low-frequency toggles step aside so the track and the transport keep their room.
const TRANSPORT_FULL_WIDTH = 860
const TRANSPORT_COMPACT_WIDTH = 560

type TransportTier = 'full' | 'medium' | 'compact'

function transportTier(width: number | null): TransportTier {
  // No measurement (no ResizeObserver) means the wide layout, which is what the row was
  // sized against before the bar learned to read its own width.
  if (width === null) return 'full'
  if (width < TRANSPORT_COMPACT_WIDTH) return 'compact'
  return width < TRANSPORT_FULL_WIDTH ? 'medium' : 'full'
}

export function MusicPlayerControls({
  queueOpen,
  onToggleQueue,
}: {
  queueOpen: boolean
  onToggleQueue: () => void
}) {
  const track = useCurrentTrack()
  const currentTimeMs = useProgress((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  const loopRange = useActiveLoopRange()
  const containerRef = useRef<HTMLDivElement>(null)
  const tier = transportTier(useElementWidth(containerRef))

  return (
    <div ref={containerRef} className='flex h-16 shrink-0 items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3'>
      <TrackSummary track={track} tier={tier} />
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <MusicPlayButtons showMode={false} />
        <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime={tier !== 'compact'} loopRange={loopRange} />
      </div>
      {tier === 'compact'
        ? <CompactActions queueOpen={queueOpen} onToggleQueue={onToggleQueue} />
        : <TransportActions tier={tier} queueOpen={queueOpen} onToggleQueue={onToggleQueue} />}
    </div>
  )
}

function TransportActions({ tier, queueOpen, onToggleQueue }: {
  tier: 'full' | 'medium'
  queueOpen: boolean
  onToggleQueue: () => void
}) {
  const setImmersive = useMusic((state) => state.setImmersive)
  const floatingVisible = useMusic((state) => state.floatingVisible)
  const toggleFloating = useMusic((state) => state.toggleFloating)
  return (
    <div className='flex shrink-0 items-center gap-0.5'>
      <MusicModeButton />
      <MusicSleepButton />
      <MusicLoopButton />
      <MusicRateButton />
      <MusicEqButton />
      {tier === 'full' ? <MusicVolumeSlider className='w-36' /> : <MusicVolumeButton />}
      <IconButton label={t('music.queue')} size='sm' active={queueOpen} onClick={onToggleQueue}>
        <ListMusic size={14} />
      </IconButton>
      <Tooltip label={t('music.immersive')} side='top'>
        <IconButton label={t('music.immersive')} size='sm' onClick={() => setImmersive(true)}><Maximize2 size={14} /></IconButton>
      </Tooltip>
      <Tooltip label={floatingVisible ? t('music.hide_mini_player') : t('music.show_mini_player')} side='top'>
        <IconButton
          label={floatingVisible ? t('music.hide_mini_player') : t('music.show_mini_player')}
          size='sm'
          active={floatingVisible}
          onClick={toggleFloating}
        >
          <PictureInPicture2 size={14} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

// At phone width the bar keeps the track, the transport and the queue; the rest answers
// the more menu. None of it is lost — every one of these still lives in the immersive
// player and on the floating card — it is simply not repeated in the narrowest row.
function CompactActions({ queueOpen, onToggleQueue }: {
  queueOpen: boolean
  onToggleQueue: () => void
}) {
  const setImmersive = useMusic((state) => state.setImmersive)
  const floatingVisible = useMusic((state) => state.floatingVisible)
  const toggleFloating = useMusic((state) => state.toggleFloating)
  const muted = useMusic((state) => state.muted)
  const toggleMute = useMusic((state) => state.toggleMute)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const items: MenuItem[] = [
    { id: 'immersive', label: t('music.immersive'), icon: <Maximize2 size={13} />, onSelect: () => setImmersive(true) },
    {
      id: 'mini',
      label: floatingVisible ? t('music.hide_mini_player') : t('music.show_mini_player'),
      icon: <PictureInPicture2 size={13} />,
      onSelect: toggleFloating,
    },
    { id: 'mute', label: muted ? t('music.unmute') : t('music.mute'), icon: <Volume2 size={13} />, onSelect: toggleMute },
  ]
  return (
    <>
      <IconButton label={t('music.queue')} size='sm' active={queueOpen} onClick={onToggleQueue}>
        <ListMusic size={14} />
      </IconButton>
      <IconButton
        ref={moreRef}
        label={t('music.more_actions')}
        size='sm'
        active={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Ellipsis size={14} />
      </IconButton>
      <Menu anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} align='end' label={t('music.more_actions')} items={items} />
    </>
  )
}

function TrackSummary({ track, tier }: { track: MusicTrack | null; tier: TransportTier }) {
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  return (
    <div className={cn(
      'flex min-w-0 shrink-0 items-center gap-2',
      tier === 'full' ? 'w-52' : tier === 'medium' ? 'w-44' : 'max-w-32',
    )}>
      <MusicArtwork url={track?.coverUrl ?? null} alt='' className='size-10 shrink-0 rounded-[var(--r-md)]' iconSize={16} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          {track?.title ?? t('music.nothing_playing')}
        </span>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
          {track?.artist || t('music.unknown_artist')}
        </span>
      </span>
      {track && tier !== 'compact' && (
        <>
          <IconButton
            label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')}
            size='sm'
            active={track.isFavorite}
            onClick={() => void toggleFavorite(track.id)}
          >
            <Heart size={13} className={track.isFavorite ? 'fill-current' : undefined} />
          </IconButton>
          <IconButton
            label={track.isPinned ? t('music.unpin') : t('music.pin')}
            size='sm'
            active={track.isPinned}
            onClick={() => void togglePin(track.id)}
          >
            <Pin size={13} />
          </IconButton>
        </>
      )}
    </div>
  )
}

