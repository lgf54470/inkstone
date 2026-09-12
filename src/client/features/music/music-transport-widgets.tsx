import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, FastForward, Gauge, ListMusic, Moon, Rewind, Volume1, Volume2, VolumeX } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import type { CSSProperties } from 'react'
import { t } from '../../lib/i18n'
import { PLAYBACK_RATES } from './music-store'
import { useMusic } from './music-store'
import { MusicPopover } from './music-popover'
import { MusicQueueBrowser } from './music-queue-browser'
import { PlayModeIcon } from './music-play-buttons'
import { playModeLabel } from './music-play-buttons'
import { cn } from '../../lib/cn'

export const SEEK_STEP_MS = 10_000

export function useSeekNudge(): (deltaMs: number) => void {
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  return useCallback((deltaMs: number) => {
    const target = currentTimeMs + deltaMs
    seek(Math.max(0, durationMs > 0 ? Math.min(target, durationMs) : target))
  }, [currentTimeMs, durationMs, seek])
}

export function MusicNudgeButton({
  direction,
  size = 'sm',
  iconSize = 13,
}: {
  direction: 'back' | 'forward'
  size?: 'sm' | 'md' | 'lg'
  iconSize?: number
}) {
  const nudge = useSeekNudge()
  const back = direction === 'back'
  const label = t(back ? 'music.rewind' : 'music.forward')
  return (
    <Tooltip label={label} side='top'>
      <IconButton label={label} size={size} onClick={() => nudge(back ? -SEEK_STEP_MS : SEEK_STEP_MS)}>
        {back ? <Rewind size={iconSize} /> : <FastForward size={iconSize} />}
      </IconButton>
    </Tooltip>
  )
}

export function MusicModeButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const mode = useMusic((state) => state.mode)
  const cycleMode = useMusic((state) => state.cycleMode)
  return (
    <Tooltip label={playModeLabel(mode)} side='top'>
      <IconButton label={playModeLabel(mode)} size={size} onClick={cycleMode}><PlayModeIcon mode={mode} /></IconButton>
    </Tooltip>
  )
}

export function MusicQueueButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const queueLength = useMusic((state) => state.queue.length)
  const clearQueue = useMusic((state) => state.clearQueue)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <span className='flex shrink-0 items-center gap-0.5'>
        <Tooltip label={t('music.queue')} side='top'>
          <IconButton ref={anchorRef} label={t('music.queue')} size={size} active={open} onClick={() => setOpen((value) => !value)}>
            <ListMusic size={14} />
          </IconButton>
        </Tooltip>
        {queueLength > 0 && (
          <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            {queueLength > 99 ? '99+' : queueLength}
          </span>
        )}
      </span>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.queue')} anchorRef={anchorRef} className='w-72'>
        <div className='mb-1 flex items-center justify-between px-1.5 py-0.5'>
          <span className='text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>
            {t('music.queue_count', { value0: queueLength })}
          </span>
          <button type='button' onClick={clearQueue} className='rounded px-1 text-[length:var(--text-10)] text-[var(--text-quaternary)] hover:text-[var(--text-primary)]'>
            {t('music.clear_queue')}
          </button>
        </div>
        <MusicQueueBrowser className='max-h-64 w-64' />
      </MusicPopover>
    </>
  )
}

export function MusicVolumeButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const volume = useMusic((state) => state.volume)
  const muted = useMusic((state) => state.muted)
  const toggleMute = useMusic((state) => state.toggleMute)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={muted ? t('music.unmute') : t('music.mute')} side='top'>
        <IconButton ref={anchorRef} label={muted ? t('music.unmute') : t('music.mute')} size={size} onClick={() => setOpen((value) => !value)} onDoubleClick={toggleMute}>
          {muted || volume === 0 ? <VolumeX size={14} /> : volume < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.volume')} anchorRef={anchorRef} className='w-48'>
        <div className='px-1.5 py-1'>
          <MusicVolumeSlider />
        </div>
      </MusicPopover>
    </>
  )
}

export function MusicVolumeSlider({ className }: { className?: string }) {
  const volume = useMusic((state) => state.volume)
  const muted = useMusic((state) => state.muted)
  const setVolume = useMusic((state) => state.setVolume)
  const toggleMute = useMusic((state) => state.toggleMute)
  const shown = muted ? 0 : volume
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Tooltip label={muted ? t('music.unmute') : t('music.mute')} side='top'>
        <IconButton label={muted ? t('music.unmute') : t('music.mute')} size='sm' onClick={toggleMute}>
          {shown === 0 ? <VolumeX size={14} /> : shown < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
        </IconButton>
      </Tooltip>
      <input
        type='range'
        className='ink-slider h-3.5 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent outline-none'
        style={{ '--pct': shown * 100 + '%' } as CSSProperties}
        min={0}
        max={100}
        value={Math.round(shown * 100)}
        aria-label={t('music.volume')}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
      />
      <span className='tabular w-6 shrink-0 text-right text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {Math.round(shown * 100)}
      </span>
    </div>
  )
}

export function MusicSleepButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const sleepEndsAt = useMusic((state) => state.sleepEndsAt)
  const setSleepTimer = useMusic((state) => state.setSleepTimer)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const options = [15, 30, 45, 60]
  return (
    <>
      <Tooltip label={t('music.sleep_timer')} side='top'>
        <IconButton ref={anchorRef} label={t('music.sleep_timer')} size={size} active={sleepEndsAt !== null} onClick={() => setOpen((value) => !value)}>
          <Moon size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.sleep_timer')} anchorRef={anchorRef} className='w-32'>
        <button
          type='button'
          onClick={() => { setSleepTimer(null); setOpen(false) }}
          className={cn('flex w-full items-center rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] hover:bg-[var(--bg-hover)]', sleepEndsAt === null ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')}
        >
          <Clock3 size={11} className='mr-1.5' />{t('music.off')}
        </button>
        {options.map((minutes) => (
          <button
            key={minutes}
            type='button'
            onClick={() => { setSleepTimer(minutes); setOpen(false) }}
            className='flex w-full items-center rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          >
            {t('music.sleep_minutes', { value0: minutes })}
          </button>
        ))}
      </MusicPopover>
    </>
  )
}

export function MusicRateButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const rate = useMusic((state) => state.playbackRate)
  const setPlaybackRate = useMusic((state) => state.setPlaybackRate)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={t('music.playback_rate')} side='top'>
        <IconButton ref={anchorRef} label={t('music.playback_rate')} size={size} active={rate !== 1} onClick={() => setOpen((value) => !value)}>
          <Gauge size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.playback_rate')} anchorRef={anchorRef} className='w-28'>
        {PLAYBACK_RATES.map((option) => (
          <button
            key={option}
            type='button'
            aria-pressed={rate === option}
            onClick={() => { setPlaybackRate(option); setOpen(false) }}
            className={cn('flex w-full items-center rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] hover:bg-[var(--bg-hover)]', rate === option ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')}
          >
            {option + '\u00d7'}
          </button>
        ))}
      </MusicPopover>
    </>
  )
}

export function MusicSleepStatus() {
  const sleepEndsAt = useMusic((state) => state.sleepEndsAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sleepEndsAt === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sleepEndsAt])
  if (sleepEndsAt === null) return null
  const remaining = Math.max(0, sleepEndsAt - now)
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  const label = minutes + ':' + String(seconds).padStart(2, '0')
  return (
    <span role='status' aria-live='polite' className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--accent)]'>
      {t('music.sleep_remaining', { value0: label })}
    </span>
  )
}