import { useEffect, useMemo, useRef } from 'react'
import { Heart, Pin, Tags } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import { IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { cn } from '../../lib/cn'
import { t, type MessageKey } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { formatBytes, formatTimecode, fullTime } from '../../lib/time'
import { useCurrentTrack, useMusic, useProgress } from './music-store'
import { MusicArtwork } from './music-artwork'
import { useTrackLyric } from './music-lyrics'
import { MusicVideoStage } from './music-video-stage'
import { activeLyricIndex, lyricsEmptyKey, lyricsPending, parseLyric } from './music-utils'

export type MusicDetailTab = 'lyrics' | 'details'

export function MusicNowPlaying({
  tab,
  onTabChange,
  onEditTags,
}: {
  tab: MusicDetailTab
  onTabChange: (tab: MusicDetailTab) => void
  onEditTags: () => void
}) {
  const track = useCurrentTrack()
  useTrackLyric(track)
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const activeIndex = useProgress((state) => activeLyricIndex(lyrics, state.currentTimeMs))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const lyricPending = lyricsPending(track)

  useEffect(() => {
    if (tab !== 'lyrics' || activeIndex < 0) return
    const row = scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')
    row?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, tab])

  return (
    <aside className='flex w-64 shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-sunken)]'>
      <Artwork track={track} />
      <NowPlayingMeta track={track} />
      <div className='px-3 pb-2'>
        <Segmented
          label={t('music.details')}
          size='sm'
          value={tab}
          onChange={onTabChange}
          options={[
            { value: 'lyrics', label: t('music.lyrics') },
            { value: 'details', label: t('music.details') },
          ]}
        />
      </div>
      {/* Overflow only scrolls from the keyboard when the scroll box itself takes focus. */}
      <div
        ref={scrollerRef}
        role='group'
        tabIndex={0}
        aria-label={tab === 'lyrics' ? t('music.lyrics') : t('music.details')}
        className='min-h-0 flex-1 overflow-y-auto px-3 pb-3'
      >
        {tab === 'lyrics'
          ? <Lyrics lines={lyrics} activeIndex={activeIndex} emptyKey={lyricsEmptyKey(Boolean(track), lyricPending)} pending={lyricPending} />
          : <Details track={track} onEditTags={onEditTags} />}
      </div>
    </aside>
  )
}

function Artwork({ track }: { track: ReturnType<typeof useCurrentTrack> }) {
  const box = 'aspect-square w-full overflow-hidden rounded-[var(--r-lg)] shadow-[var(--shadow-soft)]'
  return (
    <div className='p-3'>
      {isVideoMime(track?.mime)
        ? <MusicVideoStage track={track} className={box} />
        : (
          <MusicArtwork url={track?.coverUrl ?? null} alt='' className={cn(box, 'bg-[var(--bg-inset)]')} iconSize={28} />
        )}
    </div>
  )
}

// The column holds the artwork alone otherwise, so the playing track is named here
// too: the lyrics pane can be scrolled far from its headings.
function NowPlayingMeta({ track }: { track: ReturnType<typeof useCurrentTrack> }) {
  return (
    <header className='px-3 pb-2'>
      {track
        ? (
          <>
            <p className='truncate text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>{track.title}</p>
            <p className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{track.artist || t('music.unknown_artist')}</p>
          </>
        )
        : <p className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.nothing_playing')}</p>}
    </header>
  )
}

function Lyrics({ lines, activeIndex, emptyKey, pending }: {
  lines: ReturnType<typeof parseLyric>
  activeIndex: number
  emptyKey: MessageKey
  pending: boolean
}) {
  if (!lines.length) {
    return <p role={pending ? 'status' : undefined} className='py-8 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t(emptyKey)}</p>
  }
  return (
    <div className='space-y-1.5 py-1'>
      {lines.map((line, index) => (
        <p
          key={`${line.timeMs}-${index}`}
          data-active-line={index === activeIndex}
          className={cn(
            'text-[length:var(--text-12)] leading-[var(--writing-line)] transition-colors',
            index === activeIndex ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
          )}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}

function Details({ track, onEditTags }: { track: ReturnType<typeof useCurrentTrack>; onEditTags: () => void }) {
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const togglePin = useMusic((state) => state.togglePin)
  if (!track) {
    return <p className='py-8 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.nothing_playing')}</p>
  }
  const rows = [
    { label: t('music.field_artist'), value: track.artist || t('music.unknown_artist') },
    { label: t('music.field_album'), value: track.album || t('music.unknown_album') },
    { label: t('music.track_duration'), value: formatTimecode(track.durationMs) },
    { label: t('music.file_size'), value: formatBytes(track.sizeBytes) },
    { label: t('music.play_count'), value: String(track.playCount) },
    { label: t('music.added_at'), value: fullTime(track.createdAt) },
  ]
  return (
    <div className='space-y-2 py-1'>
      <div className='flex items-center gap-1'>
        <IconButton label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')} size='sm' active={track.isFavorite} onClick={() => void toggleFavorite(track.id)}>
          <Heart size={13} className={track.isFavorite ? 'fill-current' : undefined} />
        </IconButton>
        <IconButton label={track.isPinned ? t('music.unpin') : t('music.pin')} size='sm' active={track.isPinned} onClick={() => void togglePin(track.id)}>
          <Pin size={13} />
        </IconButton>
        <IconButton label={t('music.track_tags')} size='sm' onClick={onEditTags}><Tags size={13} /></IconButton>
      </div>
      {rows.map((row) => (
        <div key={row.label} className='flex items-start justify-between gap-3 text-[length:var(--text-11)]'>
          <span className='shrink-0 text-[var(--text-quaternary)]'>{row.label}</span>
          <span className='truncate text-right text-[var(--text-secondary)]'>{row.value}</span>
        </div>
      ))}
    </div>
  )
}
