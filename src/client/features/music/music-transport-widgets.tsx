import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Clock3, FastForward, Gauge, ListMusic, Moon, Rewind, SlidersHorizontal, Square, Volume1, Volume2, VolumeX } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Slider, Switch } from '../../components/form'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import { EQ_GAIN_RANGE_DB, PLAYBACK_RATES, progressTimeMs } from './music-store'
import { useMusic } from './music-store'
import type { MusicEqBand } from './music-store'
import { EQ_PRESETS, matchEqPreset } from './music-eq-presets'
import { MusicPopover } from './music-popover'
import { confirmClearQueue } from './music-queue-clear'
import { MusicQueueBrowser } from './music-queue-browser'
import { PlayModeIcon } from './music-play-buttons'
import { playModeLabel } from './music-play-buttons'
import { cn } from '../../lib/cn'
import { SEEK_STEP_MS, seekTargetMs } from './music-utils'

export function useSeekNudge(): (deltaMs: number) => void {
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  return useCallback((deltaMs: number) => {
    seek(seekTargetMs(progressTimeMs(), durationMs, deltaMs))
  }, [durationMs, seek])
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
          <IconButton ref={anchorRef} label={t('music.queue')} size={size} onClick={() => setOpen((value) => !value)}>
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
          {/* Text buttons are as small as their type; without a minimum box they land below the
              24px a fingertip needs. */}
          <button type='button' onClick={() => void confirmClearQueue(queueLength, clearQueue)} className='min-h-6 rounded px-1.5 text-[length:var(--text-10)] text-[var(--text-quaternary)] hover:text-[var(--text-primary)]'>
            {t('music.clear_queue')}
          </button>
        </div>
        <MusicQueueBrowser className='max-h-64 w-64' />
      </MusicPopover>
    </>
  )
}

// A click opens the volume panel, which is where muting lives: the double-click shortcut that
// used to sit here had no label, no keyboard equivalent and no way to discover it, and muting
// is already offered by a named button in the panel. The trigger is named for what it does — it
// opens the volume panel, it no longer mutes — so the name cannot promise an action it lacks.
export function MusicVolumeButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const volume = useMusic((state) => state.volume)
  const muted = useMusic((state) => state.muted)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={t('music.volume')} side='top'>
        <IconButton ref={anchorRef} label={t('music.volume')} size={size} onClick={() => setOpen((value) => !value)}>
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
      <Slider
        min={0}
        max={100}
        value={Math.round(shown * 100)}
        suffix='%'
        label={t('music.volume')}
        className='min-w-0 flex-1'
        onChange={(next) => setVolume(next / 100)}
      />
    </div>
  )
}

export function MusicSleepButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const sleepEndsAt = useMusic((state) => state.sleepEndsAt)
  const sleepMinutes = useMusic((state) => state.sleepMinutes)
  const sleepAfterCurrentTrack = useMusic((state) => state.sleepAfterCurrentTrack)
  const setSleepTimer = useMusic((state) => state.setSleepTimer)
  const setSleepAfterCurrentTrack = useMusic((state) => state.setSleepAfterCurrentTrack)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const options = [15, 30, 45, 60]
  const idle = sleepEndsAt === null && !sleepAfterCurrentTrack
  return (
    <>
      <Tooltip label={t('music.sleep_timer')} side='top'>
        <IconButton ref={anchorRef} label={t('music.sleep_timer')} size={size} highlight={!idle} onClick={() => setOpen((value) => !value)}>
          <Moon size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.sleep_timer')} anchorRef={anchorRef} className='w-32'>
        <SleepOption
          selected={idle}
          icon={<Clock3 size={11} />}
          label={t('music.off')}
          onSelect={() => { setSleepTimer(null); setOpen(false) }}
        />
        {options.map((minutes) => (
          <SleepOption
            key={minutes}
            selected={sleepEndsAt !== null && sleepMinutes === minutes}
            icon={null}
            label={t('music.sleep_minutes', { value0: minutes })}
            onSelect={() => { setSleepTimer(minutes); setOpen(false) }}
          />
        ))}
        <SleepOption
          selected={sleepAfterCurrentTrack}
          icon={<Square size={11} />}
          label={t('music.sleep_after_current')}
          onSelect={() => { setSleepAfterCurrentTrack(true); setOpen(false) }}
        />
      </MusicPopover>
    </>
  )
}

// Which option is armed used to be colour and nothing else: the menu now states it to
// assistive tech as well and marks it with a check, so the accent is not carrying it alone.
function SleepOption({ selected, icon, label, onSelect }: {
  selected: boolean
  icon: ReactNode
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] hover:bg-[var(--bg-hover)]',
        selected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
      )}
    >
      <span className='flex w-3 shrink-0 justify-center' aria-hidden='true'>{icon}</span>
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      {selected && <Check size={11} aria-hidden='true' />}
    </button>
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
        <IconButton ref={anchorRef} label={t('music.playback_rate')} size={size} highlight={rate !== 1} onClick={() => setOpen((value) => !value)}>
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

export function MusicEqButton({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const eqEnabled = useMusic((state) => state.eqEnabled)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={t('music.eq')} side='top'>
        <IconButton ref={anchorRef} label={t('music.eq')} size={size} highlight={eqEnabled} className={className} onClick={() => setOpen((value) => !value)}>
          <SlidersHorizontal size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.eq')} anchorRef={anchorRef} className='w-56'>
        <MusicEqPanel />
      </MusicPopover>
    </>
  )
}

// The presets are shortcuts onto the same three bands, so the group marks which one
// the sliders currently agree with and lets a manual move clear that mark.
function EqPresetRow() {
  const low = useMusic((state) => state.eqLowDb)
  const mid = useMusic((state) => state.eqMidDb)
  const high = useMusic((state) => state.eqHighDb)
  const applyEqPreset = useMusic((state) => state.applyEqPreset)
  const active = matchEqPreset({ low, mid, high })
  return (
    <div role='group' aria-label={t('music.eq_presets')} className='grid grid-cols-3 gap-1 pb-1'>
      {EQ_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          size='sm'
          variant={active === preset.id ? 'primary' : 'secondary'}
          aria-pressed={active === preset.id}
          className='px-1'
          onClick={() => applyEqPreset(preset.id)}
        >
          {t(preset.labelKey)}
        </Button>
      ))}
    </div>
  )
}

export function MusicEqPanel({ className }: { className?: string }) {
  const eqEnabled = useMusic((state) => state.eqEnabled)
  const setEqEnabled = useMusic((state) => state.setEqEnabled)
  const normalizeEnabled = useMusic((state) => state.normalizeEnabled)
  const setNormalizeEnabled = useMusic((state) => state.setNormalizeEnabled)
  const crossfadeEnabled = useMusic((state) => state.crossfadeEnabled)
  const setCrossfadeEnabled = useMusic((state) => state.setCrossfadeEnabled)
  return (
    <div className={cn('space-y-1 px-1.5 py-1', className)}>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>{t('music.eq_enable')}</span>
        <Switch checked={eqEnabled} onChange={setEqEnabled} label={t('music.eq_enable')} />
      </div>
      <EqPresetRow />
      <EqBandSlider band='low' label={t('music.eq_bass')} />
      <EqBandSlider band='mid' label={t('music.eq_mids')} />
      <EqBandSlider band='high' label={t('music.eq_treble')} />
      <div className='flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-1'>
        <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>{t('music.normalize')}</span>
        <Switch checked={normalizeEnabled} onChange={setNormalizeEnabled} label={t('music.normalize')} />
      </div>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>{t('music.crossfade')}</span>
        <Switch checked={crossfadeEnabled} onChange={setCrossfadeEnabled} label={t('music.crossfade')} />
      </div>
    </div>
  )
}

function EqBandSlider({ band, label }: { band: MusicEqBand; label: string }) {
  const value = useMusic((state) => band === 'low' ? state.eqLowDb : band === 'mid' ? state.eqMidDb : state.eqHighDb)
  const setEqBand = useMusic((state) => state.setEqBand)
  return (
    <div className='flex items-center gap-2'>
      <span className='w-11 shrink-0 text-[length:var(--text-11)] text-[var(--text-secondary)]'>{label}</span>
      <Slider
        label={label}
        value={value}
        min={-EQ_GAIN_RANGE_DB}
        max={EQ_GAIN_RANGE_DB}
        suffix='dB'
        onChange={(next) => setEqBand(band, next)}
        className='min-w-0 flex-1'
      />
    </div>
  )
}

export function MusicSleepStatus() {
  const sleepEndsAt = useMusic((state) => state.sleepEndsAt)
  const sleepAfterCurrentTrack = useMusic((state) => state.sleepAfterCurrentTrack)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (sleepEndsAt === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sleepEndsAt])
  // A single static line about what the sleeper will do; announcing it once
  // is the point, so a polite status fits while the countdown stays a timer.
  if (sleepEndsAt === null) {
    if (!sleepAfterCurrentTrack) return null
    return (
      <span role='status' className='shrink-0 text-[length:var(--text-10)] text-[var(--accent)]'>
        {t('music.sleep_after_current')}
      </span>
    )
  }
  const label = formatTimecode(Math.max(0, sleepEndsAt - now))
  return (
    // A per-second countdown as a polite live region re-reads itself every tick;
    // the timer's on/off state lives on the sleep button's aria-pressed instead.
    <span role='timer' aria-live='off' className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--accent)]'>
      {t('music.sleep_remaining', { value0: label })}
    </span>
  )
}