import { useEffect, useMemo, useRef } from 'react'
import { Heart, Music, Pin, Tags } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { preferredScrollBehavior } from '../../lib/motion'
import { useCurrentTrack, useMusic } from './music-store'
import { activeLyricIndex, formatBytes, formatDuration, parseLyric } from './music-utils'

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
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const activeIndex = activeLyricIndex(lyrics, currentTimeMs)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab !== 'lyrics' || activeIndex < 0) return
    const row = scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')
    row?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, tab])

  return (
    <aside className='flex w-64 shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-sunken)]'>
      <Artwork track={track} />
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
      <div ref={scrollerRef} className='min-h-0 flex-1 overflow-y-auto px-3 pb-3'>
        {tab === 'lyrics'
          ? <Lyrics lines={lyrics} activeIndex={activeIndex} />
          : <Details track={track} onEditTags={onEditTags} />}
      </div>
    </aside>
  )
}

function Artwork({ track }: { track: ReturnType<typeof useCurrentTrack> }) {
  return (
    <div className='p-3'>
      <div className='aspect-square w-full overflow-hidden rounded-[var(--r-lg)] bg-[var(--bg-inset)] shadow-[var(--shadow-soft)]'>
        {track?.coverUrl
          ? <img src={track.coverUrl} alt='' className='size-full object-cover' />
          : <span className='flex size-full items-center justify-center text-[var(--text-quaternary)]'><Music size={28} /></span>}
      </div>
    </div>
  )
}

function Lyrics({ lines, activeIndex }: { lines: ReturnType<typeof parseLyric>; activeIndex: number }) {
  if (!lines.length) {
    return <p className='py-8 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.no_lyrics')}</p>
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
  if (!track) {
    return <p className='py-8 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.nothing_playing')}</p>
  }
  const rows = [
    { label: t('music.field_artist'), value: track.artist || t('music.unknown_artist') },
    { label: t('music.field_album'), value: track.album || t('music.unknown_album') },
    { label: t('music.track_duration'), value: formatDuration(track.durationMs) },
    { label: t('music.file_size'), value: formatBytes(track.sizeBytes) },
    { label: t('music.play_count'), value: String(track.playCount) },
    { label: t('music.added_at'), value: new Date(track.createdAt).toLocaleDateString() },
  ]
  return (
    <div className='space-y-2 py-1'>
      <div className='flex items-center gap-1'>
        <IconButton label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')} size='sm' active={track.isFavorite}>
          <Heart size={13} className={track.isFavorite ? 'fill-current' : undefined} />
        </IconButton>
        <IconButton label={track.isPinned ? t('music.unpin') : t('music.pin')} size='sm' active={track.isPinned}>
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
