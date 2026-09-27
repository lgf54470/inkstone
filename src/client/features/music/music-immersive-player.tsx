import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronUp, Heart, Keyboard, ListMusic, Maximize2, Minimize2, Minus, Pin, Plus, RotateCcw, X } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import { Modal, Tooltip } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { useElementWidth, useMediaQuery } from '../../lib/hooks'
import { t, type MessageKey } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { formatBytes, formatTimecode } from '../../lib/time'
import { LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_STEP_MS, useActiveLoopRange, useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { ImmersiveBackground, MusicBackgroundButton } from './music-immersive-background'
import { LYRIC_ALIGN_CLASSES, LYRIC_IMMERSIVE_SIZE_CLASSES, MusicLyricStyleButton } from './music-lyric-style'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicQueueList } from './music-queue-list'
import { MusicSeekBar } from './music-seek-bar'
import { MusicVideoStage } from './music-video-stage'
import {
  MusicEqButton, MusicLoopButton, MusicModeButton, MusicNudgeButton, MusicRateButton, MusicSleepButton, MusicVolumeButton,
} from './music-transport-widgets'
import { MusicPopover } from './music-popover'
import { useTrackLyric } from './music-lyrics'
import type { LyricLine } from './music-utils'
import { activeLyricIndex, formatLyricOffset, lyricsEmptyKey, lyricsPending, MUSIC_NARROW_BREAKPOINT, parseLyric } from './music-utils'

const IMMERSIVE_WIDTH = 1000
// REF-10: the artwork column used to keep 384px of a 1000px dialog whatever the window
// was doing. Measured, it gives the lyrics back the width the window has to spare.
const IMMERSIVE_WIDE_PANE_WIDTH = 1100
const IMMERSIVE_MID_PANE_WIDTH = 920

export function MusicImmersiveOverlay() {
  const immersive = useMusic((state) => state.immersive)
  const setImmersive = useMusic((state) => state.setImmersive)
  return <MusicImmersivePlayer open={immersive} onClose={() => setImmersive(false)} />
}

// The lyrics a track carries, where the playhead is among them, and how far the track's
// own calibration shifts that reading. A positive calibration means "these lyrics run
// early", so the line under the playhead is found that much further back.
function useImmersiveLyrics(track: ReturnType<typeof useCurrentTrack>): {
  lyrics: LyricLine[]
  lyricOffsetMs: number
  activeIndex: number
  pending: boolean
} {
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const lyricOffsetMs = useMusic((state) => (track ? state.lyricOffsets[track.id] ?? 0 : 0))
  const activeIndex = useProgress((state) => activeLyricIndex(lyrics, state.currentTimeMs - lyricOffsetMs))
  return { lyrics, lyricOffsetMs, activeIndex, pending: lyricsPending(track) }
}

// The active line is brought into view when it changes, not on every tick of the clock.
function useLyricScroll(open: boolean, activeIndex: number, scrollerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open || activeIndex < 0) return
    scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, open, scrollerRef])
}

// A null width means nothing could be measured, which is the wide layout the column was
// sized against before REF-10.
function immersivePaneWidth(width: number | null): string {
  if (width === null || width >= IMMERSIVE_WIDE_PANE_WIDTH) return 'w-96'
  return width >= IMMERSIVE_MID_PANE_WIDTH ? 'w-80' : 'w-72'
}

// REF-10: the immersive surface is opened for one listening spell, so its size is a state
// of the moment rather than a preference carried across sessions. The measured width also
// decides how much of the window the artwork column is allowed to keep.
function useImmersiveWindow(): {
  containerRef: RefObject<HTMLDivElement | null>
  maximized: boolean
  toggleMaximized: () => void
  paneWidth: string
} {
  const [maximized, setMaximized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  return {
    containerRef,
    maximized,
    toggleMaximized: () => setMaximized((value) => !value),
    paneWidth: immersivePaneWidth(useElementWidth(containerRef)),
  }
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
  const { lyrics, lyricOffsetMs, activeIndex, pending } = useImmersiveLyrics(track)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { containerRef, maximized, toggleMaximized, paneWidth } = useImmersiveWindow()

  useLyricScroll(open, activeIndex, scrollerRef)

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('music.immersive')}
      width={IMMERSIVE_WIDTH}
      variant={maximized ? 'fullscreen' : 'dialog'}
      className={cn('p-0 overflow-hidden', maximized ? 'h-full' : 'h-[86vh]')}
      bodyClassName='p-0 flex-1 min-h-0 flex'
    >
      <div ref={containerRef} className={cn('relative flex min-h-0 flex-1 overflow-hidden', stacked && 'flex-col')}>
        <ImmersiveColumns
          track={track}
          durationMs={durationMs}
          seek={seek}
          lyrics={lyrics}
          activeIndex={activeIndex}
          lyricPending={pending}
          lyricOffsetMs={lyricOffsetMs}
          queueLength={queueLength}
          scrollerRef={scrollerRef}
          stacked={stacked}
          paneWidth={paneWidth}
          maximized={maximized}
          onToggleMaximized={toggleMaximized}
          onClose={onClose}
        />
      </div>
    </Modal>
  )
}

function ImmersiveColumns({ track, durationMs, seek, lyrics, activeIndex, lyricPending, lyricOffsetMs, queueLength, scrollerRef, stacked, paneWidth, maximized, onToggleMaximized, onClose }: {
  track: ReturnType<typeof useCurrentTrack>
  durationMs: number
  seek: (ms: number) => void
  lyrics: LyricLine[]
  activeIndex: number
  lyricPending: boolean
  lyricOffsetMs: number
  queueLength: number
  scrollerRef: RefObject<HTMLDivElement | null>
  stacked: boolean
  paneWidth: string
  maximized: boolean
  onToggleMaximized: () => void
  onClose: () => void
}) {
  return (
    <>
      <ImmersiveBackground track={track} />
      <ImmersiveLeft track={track} durationMs={durationMs} seek={seek} stacked={stacked} paneWidth={paneWidth} />
      <LyricsPanel
        track={track}
        lyrics={lyrics}
        activeIndex={activeIndex}
        lyricPending={lyricPending}
        offsetMs={lyricOffsetMs}
        queueLength={queueLength}
        scrollerRef={scrollerRef}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
        onSeekLine={(lineTimeMs) => seek(lineTimeMs + lyricOffsetMs)}
        onClose={onClose}
      />
    </>
  )
}


function LyricsPanel({ track, lyrics, activeIndex, lyricPending, offsetMs, queueLength, scrollerRef, maximized, onToggleMaximized, onSeekLine, onClose }: {
  track: ReturnType<typeof useCurrentTrack>
  lyrics: LyricLine[]
  activeIndex: number
  lyricPending: boolean
  offsetMs: number
  queueLength: number
  scrollerRef: RefObject<HTMLDivElement | null>
  maximized: boolean
  onToggleMaximized: () => void
  onSeekLine: (lineTimeMs: number) => void
  onClose: () => void
}) {
  const [queueOpen, setQueueOpen] = useState(false)
  return (
    <section className='flex min-w-0 flex-1 flex-col'>
      <LyricsHeader
        track={track}
        queueLength={queueLength}
        offsetMs={offsetMs}
        maximized={maximized}
        onToggleMaximized={onToggleMaximized}
        onClose={onClose}
      />
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
      {queueOpen
        ? <ImmersiveQueue onCollapse={() => setQueueOpen(false)} />
        : <ImmersiveQueueEntry count={queueLength} onOpen={() => setQueueOpen(true)} />}
    </section>
  )
}

// The calibration, the queue count and the window controls share the lyrics' own header:
// they all act on this one column.
function LyricsHeader({ track, queueLength, offsetMs, maximized, onToggleMaximized, onClose }: {
  track: ReturnType<typeof useCurrentTrack>
  queueLength: number
  offsetMs: number
  maximized: boolean
  onToggleMaximized: () => void
  onClose: () => void
}) {
  return (
    <div className='flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4'>
      <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.lyrics')}</span>
      <span className='flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {track && <LyricOffsetControls trackId={track.id} offsetMs={offsetMs} />}
        <MusicLyricStyleButton />
        <ListMusic size={12} />{t('music.queue_count', { value0: queueLength })}
        {/* REF-10: the same affordance the hub header grew in REF-1a — the immersive
            surface is the one place the lyrics deserve the whole window. */}
        <IconButton
          label={maximized ? t('music.restore_player') : t('music.maximize_player')}
          size='sm'
          active={maximized}
          onClick={onToggleMaximized}
        >
          {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
        <IconButton label={t('music.exit_immersive')} size='sm' onClick={onClose}><X size={15} /></IconButton>
      </span>
    </div>
  )
}

// REF-5: the queue used to keep a permanent slice of the lyrics column, which left the
// scroller short enough that long lyrics scrolled in two places at once. Folded, it
// costs one line; the count stays readable so the queue is never a hidden state.
function ImmersiveQueueEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type='button'
      onClick={onOpen}
      aria-expanded={false}
      aria-label={t('music.queue_toggle')}
      className='flex h-9 shrink-0 items-center justify-center gap-1.5 border-t border-[var(--border-subtle)] text-[length:var(--text-11)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]'
    >
      <ChevronUp size={13} />
      {t('music.queue_count', { value0: count })}
    </button>
  )
}

function ImmersiveQueue({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className='flex max-h-40 shrink-0 flex-col border-t border-[var(--border-subtle)]'>
      <div className='flex h-8 shrink-0 items-center justify-between px-2'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>{t('music.queue')}</span>
        <IconButton label={t('music.queue_toggle')} size='sm' aria-expanded onClick={onCollapse}>
          <ChevronDown size={13} />
        </IconButton>
      </div>
      <div role='group' tabIndex={0} aria-label={t('music.queue')} className='min-h-0 flex-1 overflow-y-auto p-2'>
        <MusicQueueList />
      </div>
    </div>
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
// REF-6: the shortcut sentence is a reference, not a status. It used to take two
// permanent lines under the transport and wrapped inside the left column, so it now
// answers this trigger and leaves the height to the artwork and the file line.
function MusicKeyboardHelpButton() {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={t('music.keyboard_help')} side='top'>
        <IconButton
          ref={anchorRef}
          label={t('music.keyboard_help')}
          size='sm'
          onClick={() => setOpen((value) => !value)}
        >
          <Keyboard size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.keyboard_help')} anchorRef={anchorRef} className='w-56 p-2'>
        <p className='text-[length:var(--text-11)] leading-[var(--writing-line)] text-[var(--text-tertiary)]'>
          {t('music.keyboard_hint')}
        </p>
      </MusicPopover>
    </>
  )
}

function ImmersiveButtons({ track, stacked }: { track: ReturnType<typeof useCurrentTrack>; stacked: boolean }) {
  return (
    <>
      <div className='flex items-center gap-0.5'>
        <MusicModeButton />
        <MusicBackgroundButton />
        <MusicRateButton />
        <MusicEqButton />
        <MusicVolumeButton />
        <MusicSleepButton />
        <MusicLoopButton />
        <MusicKeyboardHelpButton />
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
        <p className='text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
          {track ? (track.durationMs > 0 ? formatTimecode(track.durationMs) : t('music.duration_unknown')) + ' · ' + formatBytes(track.sizeBytes) : ''}
        </p>
      )}
    </>
  )
}

function ImmersiveLeft({
  track,
  durationMs,
  seek,
  stacked,
  paneWidth,
}: {
  track: ReturnType<typeof useCurrentTrack>
  durationMs: number
  seek: (ms: number) => void
  stacked: boolean
  paneWidth: string
}) {
  const currentTimeMs = useProgress((state) => state.currentTimeMs)
  const loopRange = useActiveLoopRange()
  const picture = cn('aspect-square rounded-[var(--r-xl)] shadow-[var(--shadow-modal)]', stacked ? 'w-20 shrink-0' : 'w-64')
  return (
    <section className={cn(
      'flex shrink-0 border-[var(--border-subtle)]',
      stacked ? 'w-full flex-row items-center gap-3 p-4' : cn(paneWidth, 'flex-col items-center gap-4 border-r p-6'),
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
        <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime className='w-full' loopRange={loopRange} />
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
  const align = useMusic((state) => state.lyricAlign)
  const textSize = useMusic((state) => state.lyricTextSize)
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
            'block w-full leading-[var(--writing-line)] transition-colors hover:text-[var(--text-secondary)]',
            LYRIC_ALIGN_CLASSES[align],
            LYRIC_IMMERSIVE_SIZE_CLASSES[textSize],
            index === activeIndex ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
          )}
        >
          {line.text}
          {line.translation && (
            <span className={cn(
              'block text-[length:var(--text-11)] leading-[var(--writing-line)] font-normal',
              index === activeIndex ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
            )}>
              {line.translation}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}