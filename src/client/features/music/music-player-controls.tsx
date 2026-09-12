import type { CSSProperties } from 'react'
import { Heart, ListMusic, Maximize2, Music, PictureInPicture2, Pin, Volume1, Volume2, VolumeX } from 'lucide-react'
import { MusicModeButton, MusicRateButton, MusicSleepButton } from './music-transport-widgets'
import type { MusicTrack } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useCurrentTrack, useMusic } from './music-store'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicSeekBar } from './music-seek-bar'

export function MusicPlayerControls({
  queueOpen,
  onToggleQueue,
}: {
  queueOpen: boolean
  onToggleQueue: () => void
}) {
  const setImmersive = useMusic((state) => state.setImmersive)
  const floatingVisible = useMusic((state) => state.floatingVisible)
  const toggleFloating = useMusic((state) => state.toggleFloating)
  const track = useCurrentTrack()
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)

  return (
    <div className='flex h-16 shrink-0 items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3'>
      <TrackSummary track={track} />
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <MusicPlayButtons showMode={false} />
        <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime />
      </div>
      <div className='flex shrink-0 items-center gap-0.5'>
        <MusicModeButton />
        <MusicSleepButton />
        <MusicRateButton />
        <VolumeControl />
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
    </div>
  )
}

function TrackSummary({ track }: { track: MusicTrack | null }) {
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  return (
    <div className='flex w-52 min-w-0 shrink-0 items-center gap-2'>
      <span className='size-10 shrink-0 overflow-hidden rounded-[var(--r-md)] bg-[var(--bg-inset)]'>
        {track?.coverUrl
          ? <img src={track.coverUrl} alt='' loading='lazy' className='size-full object-cover' />
          : <span className='flex size-full items-center justify-center text-[var(--text-quaternary)]'><Music size={16} /></span>}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {track?.title ?? t('music.nothing_playing')}
        </span>
        <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {track?.artist || t('music.unknown_artist')}
        </span>
      </span>
      {track && (
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

function VolumeControl() {
  const volume = useMusic((state) => state.volume)
  const muted = useMusic((state) => state.muted)
  const setVolume = useMusic((state) => state.setVolume)
  const toggleMute = useMusic((state) => state.toggleMute)
  const shown = muted ? 0 : volume
  return (
    <>
      <Tooltip label={muted ? t('music.unmute') : t('music.mute')} side='top'>
        <IconButton label={muted ? t('music.unmute') : t('music.mute')} size='sm' onClick={toggleMute}>
          <VolumeIcon volume={volume} muted={muted} />
        </IconButton>
      </Tooltip>
      <input
        type='range'
        className='ink-slider h-3.5 w-20 cursor-pointer appearance-none bg-transparent outline-none'
        style={{ '--pct': `${shown * 100}%` } as CSSProperties}
        min={0}
        max={100}
        value={Math.round(shown * 100)}
        aria-label={t('music.volume')}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
      />
    </>
  )
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={14} />
  if (volume < 0.5) return <Volume1 size={14} />
  return <Volume2 size={14} />
}