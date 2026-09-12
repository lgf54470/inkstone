import { Heart, Maximize2, Music, Pin } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useCurrentTrack, useMusic } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicSeekBar } from './music-seek-bar'
import {
  MusicModeButton, MusicNudgeButton, MusicQueueButton, MusicRateButton, MusicSleepButton, MusicSleepStatus,
  MusicVolumeButton,
} from './music-transport-widgets'

export function MusicStatusBar({ className, pane }: { className?: string; pane?: 'primary' | 'secondary' }) {
  const track = useCurrentTrack()
  const openHub = () => useUi.getState().openPanel('music-hub')
  if (!track) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Tooltip label={t('music.open_hub')} side='top'>
          <IconButton label={t('music.open_hub')} size='sm' onClick={openHub}><Music size={13} /></IconButton>
        </Tooltip>
        <MusicPlayButtons size='sm' showMode={false} />
      </div>
    )
  }
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)} data-pane={pane}>
      <StatusTrack />
      <Transport />
      <Extras />
    </div>
  )
}

function StatusTrack() {
  const track = useCurrentTrack()
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  const openHub = (): void => useUi.getState().openPanel('music-hub')
  if (!track) return null
  return (
    <>
      <MusicArtwork url={track.coverUrl} alt='' className='size-4 rounded-[var(--r-xs)]' iconSize={9} />
      <button
        type='button'
        onClick={openHub}
        title={track.title}
        className='min-w-0 max-w-32 truncate text-left text-[length:var(--text-11)] text-[var(--text-secondary)] hover:text-[var(--accent)] lg:max-w-44'
      >
        {track.title}
      </button>
      {track.isPinned && <Pin size={9} className='shrink-0 text-[var(--warning)]' aria-hidden='true' />}
      <IconButton label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')} size='sm' active={track.isFavorite} onClick={() => void toggleFavorite(track.id)}>
        <Heart size={11} className={track.isFavorite ? 'fill-current' : undefined} />
      </IconButton>
      <IconButton label={track.isPinned ? t('music.unpin') : t('music.pin')} size='sm' active={track.isPinned} onClick={() => void togglePin(track.id)} className='hidden xl:inline-flex'>
        <Pin size={11} />
      </IconButton>
    </>
  )
}

function Transport() {
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  return (
    <>
      <MusicNudgeButton direction='back' iconSize={12} />
      <MusicPlayButtons size='sm' showMode={false} />
      <MusicNudgeButton direction='forward' iconSize={12} />
      <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} className='hidden w-28 md:flex lg:w-40' />
    </>
  )
}

function Extras() {
  const openHub = (): void => useUi.getState().openPanel('music-hub')
  return (
    <>
      <MusicSleepStatus />
      <MusicModeButton />
      <MusicQueueButton />
      <MusicSleepButton />
      <MusicRateButton />
      <MusicVolumeButton />
      <Tooltip label={t('music.expand_player')} side='top'>
        <IconButton label={t('music.expand_player')} size='sm' onClick={openHub}><Maximize2 size={12} /></IconButton>
      </Tooltip>
    </>
  )
}