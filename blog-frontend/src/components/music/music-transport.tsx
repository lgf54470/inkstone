import {
  FastForward, Gauge, ListOrdered, Pause, Play, Repeat, Repeat1, Rewind, Shuffle, SkipBack, SkipForward,
  Volume1, Volume2, VolumeX,
} from 'lucide-react'
import { t, type BlogLocale } from '../../lib/i18n'
import { MusicIconButton } from './music-controls'
import {
  SEEK_STEP_MS, cycleMusicMode, nextPlaybackRate, nudgeMusicSeek, playNext, playPrevious, setMusicRate,
  setVolume, toggleMute, togglePlay, useMusicPlayer, type MusicPlayMode,
} from './music-player'

export function playModeLabel(mode: MusicPlayMode, locale: BlogLocale): string {
  if (mode === 'repeat-all') return t('music.mode_repeat_all', {}, locale)
  if (mode === 'repeat-one') return t('music.mode_repeat_one', {}, locale)
  if (mode === 'shuffle') return t('music.mode_shuffle', {}, locale)
  return t('music.mode_order', {}, locale)
}

function ModeIcon({ mode }: { mode: MusicPlayMode }) {
  if (mode === 'repeat-one') return <Repeat1 size={14} aria-hidden='true' />
  if (mode === 'repeat-all') return <Repeat size={14} aria-hidden='true' />
  if (mode === 'shuffle') return <Shuffle size={14} aria-hidden='true' />
  return <ListOrdered size={14} aria-hidden='true' />
}

export function MusicModeButton({ locale }: { locale: BlogLocale }) {
  const mode = useMusicPlayer().mode
  return (
    <MusicIconButton label={playModeLabel(mode, locale)} onClick={cycleMusicMode}>
      <ModeIcon mode={mode} />
    </MusicIconButton>
  )
}

export function MusicNudgeButton({ direction, locale }: { direction: 'back' | 'forward'; locale: BlogLocale }) {
  const back = direction === 'back'
  return (
    <MusicIconButton
      label={t(back ? 'music.rewind' : 'music.forward', {}, locale)}
      onClick={() => nudgeMusicSeek(back ? -SEEK_STEP_MS : SEEK_STEP_MS)}
    >
      {back ? <Rewind size={14} aria-hidden='true' /> : <FastForward size={14} aria-hidden='true' />}
    </MusicIconButton>
  )
}

export function MusicPlayButtons({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  // 博客前台没有独立音乐库面板，播放键在库非空时可用：直接开播当前筛选的第一首
  const hasTrack = Boolean(state.currentId)
  const canStart = state.tracks.length > 0
  return (
    <div className='flex items-center gap-0.5'>
      <MusicIconButton label={t('music.previous', {}, locale)} disabled={!hasTrack} onClick={playPrevious}>
        <SkipBack size={15} aria-hidden='true' />
      </MusicIconButton>
      <MusicIconButton
        label={t(state.playing ? 'music.pause' : 'music.play', {}, locale)}
        disabled={!hasTrack && !canStart}
        variant='primary'
        onClick={togglePlay}
        className='size-9'
      >
        {state.playing ? <Pause size={16} aria-hidden='true' /> : <Play size={16} aria-hidden='true' />}
      </MusicIconButton>
      <MusicIconButton label={t('music.next', {}, locale)} disabled={!hasTrack} onClick={playNext}>
        <SkipForward size={15} aria-hidden='true' />
      </MusicIconButton>
    </div>
  )
}

export function MusicRateButton({ locale }: { locale: BlogLocale }) {
  const rate = useMusicPlayer().rate
  return (
    <MusicIconButton
      label={t('music.rate', { value: rate + 'x' }, locale)}
      active={rate !== 1}
      onClick={() => setMusicRate(nextPlaybackRate(rate))}
    >
      <Gauge size={14} aria-hidden='true' />
    </MusicIconButton>
  )
}

export function MusicVolumeControl({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  const shown = state.muted ? 0 : state.volume
  return (
    <div className='flex min-w-0 flex-1 items-center gap-1.5'>
      <MusicIconButton label={t(state.muted ? 'music.unmute' : 'music.mute', {}, locale)} onClick={toggleMute}>
        {shown === 0
          ? <VolumeX size={14} aria-hidden='true' />
          : shown < 0.5 ? <Volume1 size={14} aria-hidden='true' /> : <Volume2 size={14} aria-hidden='true' />}
      </MusicIconButton>
      <input
        type='range'
        min={0}
        max={100}
        value={Math.round(shown * 100)}
        aria-label={t('music.volume', {}, locale)}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
        className='h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border-default)] accent-[var(--accent)]'
      />
      <span className='w-6 shrink-0 text-right text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>
        {Math.round(shown * 100)}
      </span>
    </div>
  )
}
