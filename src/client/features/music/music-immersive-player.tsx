import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Heart, ListMusic, Minus, Pin, Plus, RotateCcw, X } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/hooks'
import { t, type MessageKey } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { formatBytes, formatTimecode } from '../../lib/time'
import { LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_STEP_MS, useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicQueueList } from './music-queue-list'
import { MusicSeekBar } from './music-seek-bar'
import { MusicVideoStage } from './music-video-stage'
import {
  MusicEqButton, MusicLoopButton, MusicModeButton, MusicNudgeButton, MusicRateButton, MusicSleepButton, MusicVolumeButton,
} from './music-transport-widgets'
import { useTrackLyric } from './music-lyrics'
import type { LyricLine } from './music-utils'
import { activeLyricIndex, formatLyricOffset, lyricsEmptyKey, lyricsPending, MUSIC_NARROW_BREAKPOINT, parseLyric } from './music-utils'

const IMMERSIVE_WIDTH = 1000

export function MusicImmersiveOverlay() {
  const immersive = useMusic((state) => state.immersive)
  const setImmersive = useMusic((state) => state.setImmersive)
  return <MusicImmersivePlayer open={immersive} onClose={() => setImmersive(false)} />
}

export function MusicImmersivePlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const track = useCurrentTrack()
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  // A render-time getState() read only looked fresh because the track subscription
  // above happens to cover the queue too; subscribing keeps the count its own concern.
  const queueLength = useMusic((state) => state.queue.length)
  const stacked = !useMediaQuery(`(min-width: ${MUSIC_NARROW_BREAKPOINT}px)`)
  useTrackLyric(track)
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  // A positive calibration means "these lyrics run early", so the line under the
  // playhead is found that much further back.
  const lyricOffsetMs = useMusic((state) => (track ? state.lyricOffsets[track.id] ?? 0 : 0))
  const activeIndex = useProgress((state) => activeLyricIndex(lyrics, state.currentTimeMs - lyricOffsetMs))
  const lyricPending = lyricsPending(track)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || activeIndex < 0) return
    scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, open])

  return (
    <Modal open={open} onClose={onClose} ariaLabel={t('music.immersive')} width={IMMERSIVE_WIDTH} className='h-[86vh] p-0 overflow-hidden' bodyClassName='p-0 flex-1 min-h-0 flex'>
      <div className={cn('flex min-h-0 flex-1', stacked && 'flex-col')}>
        <ImmersiveLeft track={track} durationMs={durationMs} seek={seek} stacked={stacked} />
        <LyricsPanel
          track={track}
          lyrics={lyrics}
          activeIndex={activeIndex}
          lyricPending={lyricPending}
          offsetMs={lyricOffsetMs}
          queueLength={queueLength}
          scrollerRef={scrollerRef}
          onSeekLine={(lineTimeMs) => seek(lineTimeMs + lyricOffsetMs)}
          onClose={onClose}
        />
      </div>
    </Modal>
  )
}

function LyricsPanel({ track, lyrics, activeIndex, lyricPending, offsetMs, queueLength, scrollerRef, onSeekLine, onClose }: {
  track: ReturnType<typeof useCurrentTrack>
  lyrics: LyricLine[]
  activeIndex: number
  lyricPending: boolean
  offsetMs: number
  queueLength: number
  scrollerRef: RefObject<HTMLDivElement | null>
  onSeekLine: (lineTimeMs: number) => void
  onClose: () => void
}) {
  return (
    <section className='flex min-w-0 flex-1 flex-col'>
      <div className='flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4'>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.lyrics')}</span>
        <span className='flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {track && <LyricOffsetControls trackId={track.id} offsetMs={offsetMs} />}
          <ListMusic size={12} />{t('music.queue_count', { value0: queueLength })}
          <IconButton label={t('music.exit_immersive')} size='sm' onClick={onClose}><X size={15} /></IconButton>
        </span>
      </div>
      {/* Overflow only scrolls from the keyboard when the scroll box itself takes focus. */}
      <div
        ref={scrollerRef}
        role='group'
        tabIndex={0}
        aria-label={t('music.lyrics')}
        className='min-h-0 flex-1 overflow-y-auto px-6 py-4'
      >
        <Lyrics
          lines={lyrics}
          activeIndex={activeIndex}
          emptyKey={lyricsEmptyKey(Boolean(track), lyricPending)}
          pending={lyricPending}
          onSeekLine={onSeekLine}
        />
      </div>
      <div role='group' tabIndex={0} aria-label={t('music.queue')} className='max-h-40 shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] p-2'>
        <MusicQueueList />
      </div>
    </section>
  )
}

function ImmersiveMeta({ track, stacked }: { track: ReturnType<typeof useCurrentTrack>; stacked: boolean }) {
  return (
    <div className='w-full text-center'>
      <h2 className='truncate text-[length:var(--text-18)] font-semibold text-[var(--text-primary)]'>
        {track?.title ?? t('music.nothing_playing')}
      </h2>
      <p className='truncate text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{track?.artist || t('music.unknown_artist')}</p>
      {!stacked && (
        <p className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{track?.album || t('music.unknown_album')}</p>
      )}
    </div>
  )
}

// Mode/rate/volume/sleep plus the per-track favours; the wide layout also carries the
// file metadata and keyboard hint under these.
function ImmersiveButtons({ track, stacked }: { track: ReturnType<typeof useCurrentTrack>; stacked: boolean }) {
  return (
    <>
      <div className='flex items-center gap-0.5'>
        <MusicModeButton />
        <MusicRateButton />
        <MusicEqButton />
        <MusicVolumeButton />
        <MusicSleepButton />
        <MusicLoopButton />
        {track && (
          <>
            <IconButton label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')} active={track.isFavorite} onClick={() => void useMusic.getState().toggleFavorite(track.id)}>
              <Heart size={15} className={track.isFavorite ? 'fill-current' : undefined} />
            </IconButton>
            <IconButton label={track.isPinned ? t('music.unpin') : t('music.pin')} active={track.isPinned} onClick={() => void useMusic.getState().togglePin(track.id)}>
              <Pin size={15} />
            </IconButton>
          </>
        )}
      </div>
      {!stacked && (
        <>
          <p className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
            {track ? formatTimecode(track.durationMs) + ' · ' + formatBytes(track.sizeBytes) : ''}
          </p>
          <p className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
            {t('music.keyboard_hint')}
          </p>
        </>
      )}
    </>
  )
}

function ImmersiveLeft({
  track,
  durationMs,
  seek,
  stacked,
}: {
  track: ReturnType<typeof useCurrentTrack>
  durationMs: number
  seek: (ms: number) => void
  stacked: boolean
}) {
  const currentTimeMs = useProgress((state) => state.currentTimeMs)
  const picture = cn('aspect-square rounded-[var(--r-xl)] shadow-[var(--shadow-modal)]', stacked ? 'w-20 shrink-0' : 'w-64')
  return (
    <section className={cn(
      'flex shrink-0 border-[var(--border-subtle)]',
      stacked ? 'w-full flex-row items-center gap-3 p-4' : 'w-96 flex-col items-center gap-4 border-r p-6',
    )}>
      {isVideoMime(track?.mime)
        ? <MusicVideoStage track={track} className={picture} />
        : (
          <MusicArtwork
            url={track?.coverUrl ?? null}
            alt={track?.title ?? ''}
            className={picture}
            iconSize={stacked ? 28 : 48}
          />
        )}
      <div className={cn('min-w-0', stacked ? 'flex flex-1 flex-col items-center gap-1.5' : 'flex w-full flex-col items-center gap-4 text-center')}>
        <ImmersiveMeta track={track} stacked={stacked} />
        <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime className='w-full' />
        <div className='flex items-center gap-1'>
          <MusicNudgeButton direction='back' size='md' iconSize={16} />
          <MusicPlayButtons size={stacked ? 'md' : 'lg'} />
          <MusicNudgeButton direction='forward' size='md' iconSize={16} />
        </div>
        <ImmersiveButtons track={track} stacked={stacked} />
      </div>
    </section>
  )
}

// The calibration lives next to the lyrics it moves, and says where it stands so the
// shift is never a hidden state that only the ear can detect.
function LyricOffsetControls({ trackId, offsetMs }: { trackId: string; offsetMs: number }) {
  const nudgeLyricOffset = useMusic((state) => state.nudgeLyricOffset)
  const resetLyricOffset = useMusic((state) => state.resetLyricOffset)
  return (
    <span className='mr-1 flex items-center gap-0.5'>
      <IconButton label={t('music.lyric_offset_earlier')} size='sm' disabled={offsetMs <= -LYRIC_OFFSET_LIMIT_MS} onClick={() => nudgeLyricOffset(trackId, -LYRIC_OFFSET_STEP_MS)}>
        <Minus size={12} />
      </IconButton>
      <span role='status' aria-label={t('music.lyric_offset_state', { value0: formatLyricOffset(offsetMs) })} className='tabular min-w-9 text-center'>
        {formatLyricOffset(offsetMs)}
      </span>
      <IconButton label={t('music.lyric_offset_later')} size='sm' disabled={offsetMs >= LYRIC_OFFSET_LIMIT_MS} onClick={() => nudgeLyricOffset(trackId, LYRIC_OFFSET_STEP_MS)}>
        <Plus size={12} />
      </IconButton>
      {offsetMs !== 0 && (
        <IconButton label={t('music.lyric_offset_reset')} size='sm' onClick={() => resetLyricOffset(trackId)}>
          <RotateCcw size={12} />
        </IconButton>
      )}
    </span>
  )
}

function Lyrics({ lines, activeIndex, emptyKey, pending, onSeekLine }: {
  lines: ReturnType<typeof parseLyric>
  activeIndex: number
  emptyKey: MessageKey
  pending: boolean
  onSeekLine: (lineTimeMs: number) => void
}) {
  if (!lines.length) {
    return <p role={pending ? 'status' : undefined} className='py-16 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t(emptyKey)}</p>
  }
  return (
    <div className='space-y-2 py-2'>
      {lines.map((line, index) => (
        // A line is the natural target for the moment it belongs to, so it is a
        // button: keyboard reachable, and its own text is the accessible name.
        <button
          key={line.timeMs + '-' + index}
          type='button'
          data-active-line={index === activeIndex}
          aria-current={index === activeIndex ? 'true' : undefined}
          onClick={() => onSeekLine(line.timeMs)}
          className={cn(
            'block w-full text-left text-[length:var(--text-15)] leading-[var(--writing-line)] transition-colors hover:text-[var(--text-secondary)]',
            index === activeIndex ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
          )}
        >
          {line.text}
        </button>
      ))}
    </div>
  )
}