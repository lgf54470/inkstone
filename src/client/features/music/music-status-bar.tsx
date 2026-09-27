import { useEffect, useRef } from 'react'
import { Heart, Maximize2, Music, Pin } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useActiveLoopRange, useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicSeekBar } from './music-seek-bar'
import {
  MusicEqButton, MusicModeButton, MusicNudgeButton, MusicQueueButton, MusicRateButton, MusicSleepButton, MusicSleepStatus,
  MusicVolumeButton,
} from './music-transport-widgets'

export function MusicStatusBar({ className, pane }: { className?: string; pane?: 'primary' | 'secondary' }) {
  const track = useCurrentTrack()
  const openHub = () => useUi.getState().openPanel('music-hub')
  // The hub is open: its own footer is the transport, so the bar says what is playing and
  // nothing else. Three play buttons for one track only argue with each other.
  const hubOpen = useUi((state) => state.panel === 'music-hub')
  useHubCloseFocus(hubOpen)
  if (hubOpen && track) {
    return (
      <div className={cn('flex min-w-0 items-center gap-1', className)} data-pane={pane}>
        <StatusTrack quiet />
      </div>
    )
  }
  if (!track) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Tooltip label={t('music.open_hub')} side='top'>
          <IconButton label={t('music.open_hub')} size='sm' data-music-opener='hub' onClick={openHub}><Music size={13} /></IconButton>
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

/**
 * FB-C3: closing the library has to leave the keyboard somewhere on the page. The bar swaps its own
 * transport for a quiet title row in the same commit that mounts the hub, so the control the hub was
 * opened from is gone by the time the shared hand-off looks for it — the hand-off captured the body
 * instead, and the body is where focus then stayed (measured on the way to this: the browser gate
 * found `active: body[]` after Escape). The bar owns the replacement, so the bar takes the keyboard
 * back — only when nobody holds it, and only on the transition that closes the hub.
 */
function useHubCloseFocus(hubOpen: boolean): void {
  const wasOpen = useRef(hubOpen)
  useEffect(() => {
    const closed = wasOpen.current && !hubOpen
    wasOpen.current = hubOpen
    if (!closed || document.activeElement !== document.body) return
    document.querySelector<HTMLElement>('[data-music-opener="hub"]')?.focus({ preventScroll: true })
  }, [hubOpen])
}

function StatusTrack({ quiet = false }: { quiet?: boolean }) {
  const track = useCurrentTrack()
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  const openHub = (): void => useUi.getState().openPanel('music-hub')
  if (!track) return null
  // FB-C3: every control that opens the hub carries the same successor marker, and this is the one
  // that survives the hub being open — the bar swaps its transport for this title row, so the
  // control the hub was opened from is replaced rather than hidden. `successorOf` reads the marker
  // when Escape closes the hub, which is how the keyboard lands back on the music controls instead
  // of on the body (it landed on the body until this existed: the opener no longer is a node).
  if (quiet) {
    return (
      <button
        type='button'
        onClick={openHub}
        data-music-opener='hub'
        aria-label={t('music.open_hub_track', { value0: track.title })}
        className='min-w-0 max-w-32 truncate text-left text-[length:var(--text-11)] text-[var(--text-secondary)] hover:text-[var(--accent)] lg:max-w-44'
      >
        {track.title}
      </button>
    )
  }
  return (
    <>
      <MusicArtwork url={track.coverUrl} alt='' className='size-4 rounded-[var(--r-xs)]' iconSize={9} />
      <button
        type='button'
        onClick={openHub}
        data-music-opener='hub'
        aria-label={t('music.open_hub_track', { value0: track.title })}
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
  const currentTimeMs = useProgress((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  const loopRange = useActiveLoopRange()
  return (
    <>
      <MusicNudgeButton direction='back' iconSize={12} />
      <MusicPlayButtons size='sm' showMode={false} />
      <MusicNudgeButton direction='forward' iconSize={12} />
      <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} className='hidden w-28 md:flex lg:w-40' loopRange={loopRange} />
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
      {/* The slim bar only has room for the EQ from the wide breakpoint up. */}
      <MusicEqButton className='hidden lg:inline-flex' />
      <MusicVolumeButton />
      <Tooltip label={t('music.expand_player')} side='top'>
        <IconButton label={t('music.expand_player')} size='sm' data-music-opener='hub' onClick={openHub}><Maximize2 size={12} /></IconButton>
      </Tooltip>
    </>
  )
}