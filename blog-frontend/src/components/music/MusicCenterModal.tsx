import { useEffect, useMemo } from 'react'
import { Music, Pause, Play, Search, X } from 'lucide-react'
import { t, type BlogLocale } from '../../lib/i18n'
import { useFocusTrap, useScrollLock } from '../../lib/use-focus-trap'
import type { BlogMusicTag, BlogMusicTrack } from '../../lib/types'
import { MusicIconButton } from './music-controls'
import {
  closeMusicCenter,
  filterTracks,
  formatMusicTime,
  playAllVisible,
  playTrack,
  setMusicQuery,
  setMusicTag,
  togglePlay,
  useMusicPlayer,
} from './music-player'

/** 音乐中心：只读浏览、搜索与播放；上传、编辑、WebDAV 在笔记应用内完成 */
export default function MusicCenterModal({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  const trapRef = useFocusTrap<HTMLDivElement>(state.centerOpen)
  useScrollLock(state.centerOpen)
  useEscapeToClose(state.centerOpen)
  const visible = useMemo(() => filterTracks(state.tracks, state.query, state.tagId), [state.tracks, state.query, state.tagId])
  const tags = useMemo(
    () => state.tags.filter((tag) => state.tracks.some((track) => track.tagIds.includes(tag.id))),
    [state.tags, state.tracks],
  )
  if (!state.centerOpen) return null
  return (
    <div className='fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 md:pt-24'>
      <div className='fixed inset-0 bg-black/45' onClick={closeMusicCenter} aria-hidden='true' />
      <div
        ref={trapRef}
        role='dialog'
        aria-modal='true'
        aria-label={t('music.open_center', {}, locale)}
        className='relative flex max-h-[72vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl'
      >
        <CenterHeader locale={locale} />
        <CenterSearch locale={locale} />
        <TagChips tags={tags} active={state.tagId} locale={locale} />
        <TrackList tracks={visible} currentId={state.currentId} playing={state.playing} locale={locale} />
        <CenterFooter count={visible.length} locale={locale} />
      </div>
    </div>
  )
}

function useEscapeToClose(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMusicCenter()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])
}

function CenterHeader({ locale }: { locale: BlogLocale }) {
  return (
    <header className='flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3'>
      <Music size={15} className='shrink-0 text-[var(--accent)]' aria-hidden='true' />
      <span className='text-sm font-semibold text-[var(--text-primary)]'>{t('music.open_center', {}, locale)}</span>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.readonly', {}, locale)}</span>
      <MusicIconButton label={t('music.close', {}, locale)} onClick={closeMusicCenter}><X size={14} /></MusicIconButton>
    </header>
  )
}

function CenterSearch({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  return (
    <div className='flex items-center gap-2 px-4 py-3'>
      <Search size={13} className='shrink-0 text-[var(--text-quaternary)]' aria-hidden='true' />
      <input
        type='search'
        value={state.query}
        aria-label={t('music.search_placeholder', {}, locale)}
        placeholder={t('music.search_placeholder', {}, locale)}
        onChange={(event) => setMusicQuery(event.target.value)}
        className='h-8 min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-inset)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      />
    </div>
  )
}

function TagChips({ tags, active, locale }: { tags: BlogMusicTag[]; active: string | null; locale: BlogLocale }) {
  if (!tags.length) return null
  return (
    <div className='flex flex-wrap gap-1.5 px-4 pb-3'>
      <TagChip label={t('music.all_tracks', {}, locale)} selected={active === null} onClick={() => setMusicTag(null)} />
      {tags.map((tag) => (
        <TagChip key={tag.id} label={tag.name} selected={active === tag.id} onClick={() => setMusicTag(tag.id)} />
      ))}
    </div>
  )
}

function TagChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const tone = selected
    ? 'border-[var(--accent)] text-[var(--accent)]'
    : 'border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
  return (
    <button
      type='button'
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-[var(--dur-fast)] ${tone}`}
    >
      {label}
    </button>
  )
}

function TrackList({ tracks, currentId, playing, locale }: { tracks: BlogMusicTrack[]; currentId: string | null; playing: boolean; locale: BlogLocale }) {
  if (!tracks.length) {
    return <p className='px-4 py-10 text-center text-sm text-[var(--text-quaternary)]'>{t('music.no_results', {}, locale)}</p>
  }
  return (
    <ul className='min-h-0 flex-1 overflow-y-auto px-2 pb-2'>
      {tracks.map((track) => (
        <TrackRow key={track.id} track={track} isCurrent={track.id === currentId} playing={playing} locale={locale} />
      ))}
    </ul>
  )
}

function TrackRow({ track, isCurrent, playing, locale }: { track: BlogMusicTrack; isCurrent: boolean; playing: boolean; locale: BlogLocale }) {
  return (
    <li className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${isCurrent ? 'bg-[var(--accent-softer)]' : 'hover:bg-[var(--bg-hover)]'}`}>
      <MusicIconButton
        label={isCurrent && playing ? t('music.pause', {}, locale) : t('music.play', {}, locale)}
        active={isCurrent}
        onClick={() => (isCurrent ? togglePlay() : playTrack(track.id))}
      >
        {isCurrent && playing ? <Pause size={14} /> : <Play size={14} />}
      </MusicIconButton>
      <button
        type='button'
        onClick={() => playTrack(track.id)}
        className='min-w-0 flex-1 text-left'
        aria-label={`${t('music.play', {}, locale)} ${track.title}`}
      >
        <span className={`block truncate text-sm ${isCurrent ? 'font-medium text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{track.title}</span>
        <span className='block truncate text-xs text-[var(--text-tertiary)]'>
          {track.artist || t('music.unknown_artist', {}, locale)} · {track.album || t('music.unknown_album', {}, locale)}
        </span>
      </button>
      <span className='shrink-0 text-xs tabular-nums text-[var(--text-quaternary)]'>{formatMusicTime(track.durationMs)}</span>
    </li>
  )
}

function CenterFooter({ count, locale }: { count: number; locale: BlogLocale }) {
  return (
    <footer className='flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3'>
      <span className='text-xs text-[var(--text-quaternary)]'>{t('music.track_count', { count }, locale)}</span>
      <button
        type='button'
        onClick={playAllVisible}
        disabled={count === 0}
        className='inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-contrast)] disabled:opacity-40'
      >
        <Play size={12} aria-hidden='true' />{t('music.play_all', {}, locale)}
      </button>
    </footer>
  )
}
