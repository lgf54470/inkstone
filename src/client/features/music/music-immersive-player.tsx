import { useEffect, useMemo, useRef } from 'react'
import { Heart, ListMusic, Pin, X } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/hooks'
import { t, type MessageKey } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { formatBytes, formatTimecode } from '../../lib/time'
import { useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicQueueList } from './music-queue-list'
import { MusicSeekBar } from './music-seek-bar'
import { MusicVideoStage } from './music-video-stage'
import {
  MusicEqButton, MusicModeButton, MusicNudgeButton, MusicRateButton, MusicSleepButton, MusicVolumeButton,
} from './music-transport-widgets'
import { useTrackLyric } from './music-lyrics'
import { activeLyricIndex, lyricsEmptyKey, lyricsPending, MUSIC_NARROW_BREAKPOINT, parseLyric } from './music-utils'

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
  const activeIndex = useProgress((state) => activeLyricIndex(lyrics, state.currentTimeMs))
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
        <section className='flex min-w-0 flex-1 flex-col'>
          <div className='flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4'>
            <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.lyrics')}</span>
            <span className='flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
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
            <Lyrics lines={lyrics} activeIndex={activeIndex} emptyKey={lyricsEmptyKey(Boolean(track), lyricPending)} pending={lyricPending} />
          </div>
          <div role='group' tabIndex={0} aria-label={t('music.queue')} className='max-h-40 shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] p-2'>
            <MusicQueueList />
          </div>
        </section>
      </div>
    </Modal>
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

function Lyrics({ lines, activeIndex, emptyKey, pending }: {
  lines: ReturnType<typeof parseLyric>
  activeIndex: number
  emptyKey: MessageKey
  pending: boolean
}) {
  if (!lines.length) {
    return <p role={pending ? 'status' : undefined} className='py-16 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t(emptyKey)}</p>
  }
  return (
    <div className='space-y-2 py-2'>
      {lines.map((line, index) => (
        <p
          key={line.timeMs + '-' + index}
          data-active-line={index === activeIndex}
          className={cn(
            'text-[length:var(--text-15)] leading-[var(--writing-line)] transition-colors',
            index === activeIndex ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
          )}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}