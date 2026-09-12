import { ChevronDown, ListMusic, Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { BlogMusicTrack } from '../../lib/types'
import { t, type BlogLocale } from '../../lib/i18n'
import { activeLyricWindow, parseLyric } from './music-lyrics'
import { MusicIconButton, MusicSeekBar } from './music-controls'
import {
  currentMusicTrack,
  formatMusicTime,
  openMusicCenter,
  playNext,
  playPrevious,
  seekTo,
  setVolume,
  toggleMute,
  togglePlay,
  togglePlayerExpanded,
  useMusicPlayer,
  type MusicPlayerSnapshot,
} from './music-player'

/** 博客前台悬浮播放器：只读播放，不含上传、编辑、下载与收藏 */
export default function MusicFloatingPlayer({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  const track = currentMusicTrack(state)
  if (!state.expanded) return <MusicBadge track={track} playing={state.playing} locale={locale} />
  return <MusicCard state={state} track={track} locale={locale} />
}

function MusicBadge({ track, playing, locale }: { track: BlogMusicTrack | null; playing: boolean; locale: BlogLocale }) {
  return (
    <button
      type='button'
      aria-label={t('music.expand', {}, locale)}
      onClick={togglePlayerExpanded}
      className='fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center overflow-hidden rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl transition-transform hover:scale-105 md:bottom-6'
    >
      {track?.coverUrl
        ? <img src={track.coverUrl} alt='' className='size-full object-cover' loading='lazy' />
        : <Music size={20} className='text-[var(--accent)]' aria-hidden='true' />}
      {playing && <span className='absolute right-1 bottom-1 size-2.5 rounded-full bg-[var(--success)] ring-2 ring-[var(--bg-surface)]' aria-hidden='true' />}
    </button>
  )
}

function MusicCard({ state, track, locale }: { state: MusicPlayerSnapshot; track: BlogMusicTrack | null; locale: BlogLocale }) {
  return (
    <aside
      aria-label={t('music.now_playing', {}, locale)}
      className='fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 w-72 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl md:bottom-6'
    >
      <header className='flex h-9 items-center gap-1 border-b border-[var(--border-subtle)] px-3'>
        <span className='min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-tertiary)]'>{t('music.now_playing', {}, locale)}</span>
        <MusicIconButton label={t('music.queue', {}, locale)} onClick={openMusicCenter}><ListMusic size={13} /></MusicIconButton>
        <MusicIconButton label={t('music.collapse', {}, locale)} onClick={togglePlayerExpanded}><ChevronDown size={13} /></MusicIconButton>
      </header>
      <TrackSummary track={track} timeMs={state.timeMs} locale={locale} />
      <div className='px-3 pb-1'>
        <MusicSeekBar valueMs={state.timeMs} durationMs={state.durationMs} onSeek={seekTo} label={t('music.now_playing', {}, locale)} />
        <div className='flex justify-between pt-0.5 text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>
          <span>{formatMusicTime(state.timeMs)}</span>
          <span>{formatMusicTime(state.durationMs)}</span>
        </div>
      </div>
      <Transport playing={state.playing} hasTrack={Boolean(track)} locale={locale} />
      <VolumeRow volume={state.volume} muted={state.muted} locale={locale} />
    </aside>
  )
}

function TrackSummary({ track, timeMs, locale }: { track: BlogMusicTrack | null; timeMs: number; locale: BlogLocale }) {
  const lyric = activeLyricWindow(parseLyric(track?.lyric), timeMs).current
  return (
    <div className='flex items-center gap-2.5 p-3'>
      <span className='flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-inset)]'>
        {track?.coverUrl
          ? <img src={track.coverUrl} alt='' className='size-full object-cover' loading='lazy' />
          : <Music size={18} className='text-[var(--text-quaternary)]' aria-hidden='true' />}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium text-[var(--text-primary)]'>{track?.title ?? t('music.empty', {}, locale)}</span>
        <span className='block truncate text-xs text-[var(--text-tertiary)]'>{track?.artist || t('music.unknown_artist', {}, locale)}</span>
        <span className='block truncate text-xs text-[var(--accent)]'>{lyric ?? ''}</span>
      </span>
    </div>
  )
}

function Transport({ playing, hasTrack, locale }: { playing: boolean; hasTrack: boolean; locale: BlogLocale }) {
  return (
    <div className='flex items-center justify-center gap-1 py-1'>
      <MusicIconButton label={t('music.previous', {}, locale)} disabled={!hasTrack} onClick={playPrevious}><SkipBack size={15} /></MusicIconButton>
      <MusicIconButton label={playing ? t('music.pause', {}, locale) : t('music.play', {}, locale)} disabled={!hasTrack} onClick={togglePlay} className='size-9 bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)]'>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </MusicIconButton>
      <MusicIconButton label={t('music.next', {}, locale)} disabled={!hasTrack} onClick={playNext}><SkipForward size={15} /></MusicIconButton>
    </div>
  )
}

function VolumeRow({ volume, muted, locale }: { volume: number; muted: boolean; locale: BlogLocale }) {
  const shown = muted ? 0 : volume
  return (
    <div className='flex items-center gap-2 px-3 pt-1 pb-3'>
      <MusicIconButton label={t(muted ? 'music.unmute' : 'music.mute', {}, locale)} onClick={toggleMute}>
        {shown === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
      <span className='w-6 shrink-0 text-right text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>{Math.round(shown * 100)}</span>
    </div>
  )
}
