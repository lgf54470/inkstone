import { useEffect, useState } from 'react'
import { GripVertical, Library, ListMusic, Minimize2, Music } from 'lucide-react'
import { t, type BlogLocale } from '../../lib/i18n'
import type { BlogMusicTrack } from '../../lib/types'
import { MusicIconButton, MusicSeekBar } from './music-controls'
import MusicFloatingLyrics from './music-floating-lyrics'
import MusicQueuePanel from './music-queue-panel'
import { MusicModeButton, MusicNudgeButton, MusicPlayButtons, MusicRateButton, MusicVolumeControl } from './music-transport'
import { MusicVisualizer } from './music-visualizer'
import { clampPosition, useCardDrag, useMeasuredSize, type CardDrag } from './music-drag'
import {
  currentMusicTrack,
  formatMusicTime,
  openMusicCenter,
  seekTo,
  setFloatPosition,
  togglePlayerExpanded,
  useMusicPlayer,
  type MusicPlayerSnapshot,
} from './music-player'

const CARD_WIDTH = 288
const CARD_HEIGHT_FALLBACK = 200
const RING_SIZE = 56
const RING_RADIUS = 25
const RING_STROKE = 2
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
const DEFAULT_ANCHOR = 'right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-6'
const CARD_SHELL = 'fixed z-40 flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-float)]'

interface PlayerProps {
  state: MusicPlayerSnapshot
  track: BlogMusicTrack | null
  drag: CardDrag
  cardRef: (node: HTMLElement | null) => void
  locale: BlogLocale
}

/** 博客前台悬浮播放器：布局与功能对齐笔记应用，仅去掉上传、编辑、收藏、下载、沉浸式与睡眠定时 */
export default function MusicFloatingPlayer({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  const track = currentMusicTrack(state)
  const { ref: cardRef, size } = useMeasuredSize({ width: CARD_WIDTH, height: CARD_HEIGHT_FALLBACK })
  const drag = useCardDrag(state.floatPosition, size, setFloatPosition)
  const position = state.floatPosition

  // 收起时尺寸更小，展开后可能贴边溢出，这里按当前尺寸重新钳制
  useEffect(() => {
    if (!position) return
    const next = clampPosition(position, size, { width: window.innerWidth, height: window.innerHeight })
    if (next.x !== position.x || next.y !== position.y) setFloatPosition(next)
  }, [position, size])

  const player: PlayerProps = { state, track, drag, cardRef, locale }
  if (!state.expanded) return <MusicBadge {...player} />
  return <MusicCard {...player} />
}

function MusicBadge({ state, track, drag, cardRef, locale }: PlayerProps) {
  const progress = state.durationMs > 0 ? Math.min(1, state.timeMs / state.durationMs) : 0
  const anchor = drag.style ? '' : DEFAULT_ANCHOR
  return (
    <button
      ref={cardRef}
      type='button'
      style={drag.style}
      onPointerDown={drag.startDrag}
      onKeyDown={drag.onKeyDown}
      onClick={() => {
        if (!drag.isClickAfterDrag()) togglePlayerExpanded()
      }}
      aria-label={t('music.expand', {}, locale)}
      className={`fixed z-40 flex size-14 touch-none items-center justify-center overflow-hidden rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-float)] transition-transform active:scale-95 ${drag.isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${anchor}`}
    >
      <BadgeRing progress={progress} />
      {track?.coverUrl
        ? <img src={track.coverUrl} alt='' className='absolute inset-1.5 rounded-full object-cover' loading='lazy' />
        : <Music size={18} className='text-[var(--accent)]' aria-hidden='true' />}
      {state.playing && (
        <span className='absolute right-1 bottom-1 size-2.5 rounded-full bg-[var(--success)] ring-2 ring-[var(--bg-overlay)]' aria-hidden='true' />
      )}
    </button>
  )
}

function BadgeRing({ progress }: { progress: number }) {
  return (
    <svg viewBox={'0 0 ' + RING_SIZE + ' ' + RING_SIZE} className='pointer-events-none absolute inset-0 size-full -rotate-90' aria-hidden='true'>
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill='none' stroke='var(--border-default)' strokeWidth={RING_STROKE} />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill='none'
        stroke='var(--accent)'
        strokeWidth={RING_STROKE}
        strokeLinecap='round'
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - progress)}
      />
    </svg>
  )
}

function MusicCard({ state, track, drag, cardRef, locale }: PlayerProps) {
  const [queueOpen, setQueueOpen] = useState(false)
  return (
    <aside
      ref={cardRef}
      aria-label={t('music.now_playing', {}, locale)}
      style={drag.style}
      className={`${CARD_SHELL} w-72 ${drag.style ? '' : DEFAULT_ANCHOR}`}
    >
      <FloatHeader drag={drag} locale={locale} />
      <FloatTrack track={track} locale={locale} />
      <MusicFloatingLyrics />
      <div className='shrink-0 px-2.5 pb-1'>
        <MusicVisualizer className='h-6 w-full' />
      </div>
      <FloatProgress state={state} locale={locale} />
      <FloatTransport queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((value) => !value)} locale={locale} />
      <FloatExtras locale={locale} />
      {queueOpen && <MusicQueuePanel locale={locale} />}
    </aside>
  )
}

function FloatHeader({ drag, locale }: { drag: CardDrag; locale: BlogLocale }) {
  return (
    <div
      onPointerDown={drag.startDrag}
      className={`flex h-9 shrink-0 touch-none items-center gap-1.5 border-b border-[var(--border-subtle)] px-2.5 ${drag.isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      <span
        role='button'
        tabIndex={0}
        aria-label={t('music.drag', {}, locale)}
        onKeyDown={drag.onKeyDown}
        className='rounded p-0.5 text-[var(--text-quaternary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
      >
        <GripVertical size={13} aria-hidden='true' />
      </span>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {t('music.now_playing', {}, locale)}
      </span>
      <MusicIconButton
        label={t('music.collapse', {}, locale)}
        onClick={() => {
          if (!drag.isClickAfterDrag()) togglePlayerExpanded()
        }}
      >
        <Minimize2 size={13} aria-hidden='true' />
      </MusicIconButton>
    </div>
  )
}

function FloatTrack({ track, locale }: { track: BlogMusicTrack | null; locale: BlogLocale }) {
  return (
    <div className='flex shrink-0 items-center gap-2.5 p-2.5'>
      <span className='flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-md)] bg-[var(--bg-inset)]'>
        {track?.coverUrl
          ? <img src={track.coverUrl} alt='' className='size-full object-cover' loading='lazy' />
          : <Music size={20} className='text-[var(--text-quaternary)]' aria-hidden='true' />}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {track?.title ?? t('music.nothing_playing', {}, locale)}
        </span>
        <span className='block truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {track?.artist || t('music.unknown_artist', {}, locale)}
        </span>
        <span className='block truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{track?.album || ''}</span>
      </span>
    </div>
  )
}

function FloatProgress({ state, locale }: { state: MusicPlayerSnapshot; locale: BlogLocale }) {
  return (
    <div className='flex shrink-0 items-center gap-2 px-2.5'>
      <span className='shrink-0 text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>{formatMusicTime(state.timeMs)}</span>
      <MusicSeekBar
        valueMs={state.timeMs}
        durationMs={state.durationMs}
        onSeek={seekTo}
        label={t('music.seek', {}, locale)}
        className='min-w-0 flex-1'
      />
      <span className='shrink-0 text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>{formatMusicTime(state.durationMs)}</span>
    </div>
  )
}

function FloatTransport({ queueOpen, onToggleQueue, locale }: { queueOpen: boolean; onToggleQueue: () => void; locale: BlogLocale }) {
  const queueLength = useMusicPlayer().queue.length
  return (
    <div className='flex shrink-0 items-center justify-center gap-0.5 py-1.5'>
      <MusicModeButton locale={locale} />
      <MusicNudgeButton direction='back' locale={locale} />
      <MusicPlayButtons locale={locale} />
      <MusicNudgeButton direction='forward' locale={locale} />
      <span className='mx-1 h-4 w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <MusicIconButton label={t('music.queue', {}, locale)} active={queueOpen} onClick={onToggleQueue}>
        <ListMusic size={14} aria-hidden='true' />
      </MusicIconButton>
      <span className={`shrink-0 text-[length:var(--text-11)] tabular-nums ${queueOpen ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]'}`}>
        {queueLength > 99 ? '99+' : queueLength}
      </span>
    </div>
  )
}

function FloatExtras({ locale }: { locale: BlogLocale }) {
  return (
    <div className='flex shrink-0 items-center gap-0.5 px-2.5 pb-2.5'>
      <MusicVolumeControl locale={locale} />
      <MusicRateButton locale={locale} />
      <MusicIconButton label={t('music.open_center', {}, locale)} onClick={openMusicCenter}>
        <Library size={14} aria-hidden='true' />
      </MusicIconButton>
    </div>
  )
}
