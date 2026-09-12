import { useEffect, useMemo, useRef } from 'react'
import { Heart, ListMusic, Pin } from 'lucide-react'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { useCurrentTrack, useMusic } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicQueueList } from './music-queue-list'
import { MusicSeekBar } from './music-seek-bar'
import {
  MusicModeButton, MusicNudgeButton, MusicRateButton, MusicSleepButton, MusicVolumeButton,
} from './music-transport-widgets'
import { activeLyricIndex, formatBytes, formatDuration, parseLyric } from './music-utils'

const IMMERSIVE_WIDTH = 1000

export function MusicImmersiveOverlay() {
  const immersive = useMusic((state) => state.immersive)
  const setImmersive = useMusic((state) => state.setImmersive)
  return <MusicImmersivePlayer open={immersive} onClose={() => setImmersive(false)} />
}

export function MusicImmersivePlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const track = useCurrentTrack()
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const activeIndex = activeLyricIndex(lyrics, currentTimeMs)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || activeIndex < 0) return
    scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, open])

  return (
    <Modal open={open} onClose={onClose} width={IMMERSIVE_WIDTH} className='h-[86vh] p-0 overflow-hidden' bodyClassName='p-0 flex-1 min-h-0 flex'>
      <div className='flex min-h-0 flex-1'>
        <ImmersiveLeft track={track} currentTimeMs={currentTimeMs} durationMs={durationMs} seek={seek} />
        <section className='flex min-w-0 flex-1 flex-col'>
          <div className='flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4'>
            <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.lyrics')}</span>
            <span className='flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
              <ListMusic size={12} />{t('music.queue_count', { value0: useMusic.getState().queue.length })}
            </span>
          </div>
          <div ref={scrollerRef} className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
            <Lyrics lines={lyrics} activeIndex={activeIndex} />
          </div>
          <div className='max-h-40 shrink-0 overflow-y-auto border-t border-[var(--border-subtle)] p-2'>
            <MusicQueueList />
          </div>
        </section>
      </div>
    </Modal>
  )
}

function ImmersiveLeft({
  track,
  currentTimeMs,
  durationMs,
  seek,
}: {
  track: ReturnType<typeof useCurrentTrack>
  currentTimeMs: number
  durationMs: number
  seek: (ms: number) => void
}) {
  return (
    <>
        <section className='flex w-96 shrink-0 flex-col items-center gap-4 border-r border-[var(--border-subtle)] p-6'>
          <MusicArtwork url={track?.coverUrl ?? null} alt={track?.title ?? ''} className='aspect-square w-64 rounded-[var(--r-xl)] shadow-[var(--shadow-modal)]' iconSize={48} />
          <div className='w-full text-center'>
            <h2 className='truncate text-[length:var(--text-18)] font-semibold text-[var(--text-primary)]'>
              {track?.title ?? t('music.nothing_playing')}
            </h2>
            <p className='truncate text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{track?.artist || t('music.unknown_artist')}</p>
            <p className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{track?.album || t('music.unknown_album')}</p>
          </div>
          <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime className='w-full' />
          <div className='flex items-center gap-1'>
            <MusicNudgeButton direction='back' size='md' iconSize={16} />
            <MusicPlayButtons size='lg' />
            <MusicNudgeButton direction='forward' size='md' iconSize={16} />
          </div>
          <div className='flex items-center gap-0.5'>
            <MusicModeButton />
            <MusicRateButton />
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
          <p className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
            {track ? formatDuration(track.durationMs) + ' · ' + formatBytes(track.sizeBytes) : ''}
          </p>
        </section>
    </>
  )
}

function Lyrics({ lines, activeIndex }: { lines: ReturnType<typeof parseLyric>; activeIndex: number }) {
  if (!lines.length) {
    return <p className='py-16 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.no_lyrics')}</p>
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