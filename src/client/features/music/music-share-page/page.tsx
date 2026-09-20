import { useEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import type { PublicPlaylist } from '../../../lib/api'
import { api, ApiError } from '../../../lib/api'
import { Logo } from '../../../components/primitives'
import { Empty, LoadingBlock } from '../../../components/feedback'
import { Tooltip } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { MusicArtwork } from '../music-artwork'
import { formatDuration, formatTotalDuration } from '../music-utils'

type Load =
  | { status: 'loading' }
  | { status: 'ready'; playlist: PublicPlaylist }
  | { status: 'unavailable' }
  | { status: 'failed' }

// The anonymous half of M-51: a shared playlist opens for anyone at
// /playlist/:slug with no session, so this page never touches the music store.
export function MusicPlaylistSharePage({ slug }: { slug: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    api.music.publicPlaylist(slug)
      .then((playlist) => {
        if (!cancelled) setLoad({ status: 'ready', playlist })
      })
      .catch((error) => {
        if (!cancelled) {
          setLoad(error instanceof ApiError && error.status === 404 ? { status: 'unavailable' } : { status: 'failed' })
        }
      })
    return () => { cancelled = true }
  }, [slug])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
  }

  const playlist = load.status === 'ready' ? load.playlist : null
  const tracks = playlist?.tracks ?? []
  const currentIndex = tracks.findIndex((track) => track.id === currentId)
  const current = currentIndex >= 0 ? tracks[currentIndex] : null
  const totalDurationMs = useMemo(() => tracks.reduce((sum, track) => sum + track.durationMs, 0), [tracks])
  const coverUrl = tracks.find((track) => track.coverUrl)?.coverUrl ?? null

  return (
    <div className='h-full overflow-y-auto overscroll-contain bg-[var(--bg-base)]'>
      <ShareTopBar dark={dark} onToggleTheme={toggleTheme} />
      <main className='mx-auto max-w-215 px-4 pb-[calc(120px+env(safe-area-inset-bottom))] md:px-5 md:pb-32'>
        <PlaylistBody load={load} currentId={currentId} onPlay={setCurrentId} coverUrl={coverUrl} trackCount={tracks.length} totalDurationMs={totalDurationMs} />
      </main>
      {current && (
        <NowPlayingBar
          track={current}
          onNext={currentIndex + 1 < tracks.length ? () => setCurrentId(tracks[currentIndex + 1]!.id) : undefined}
        />
      )}
    </div>
  )
}

function ShareTopBar({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  return (
    <header className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/85 pt-[env(safe-area-inset-top)] backdrop-blur'>
      <div className='mx-auto flex h-12 max-w-215 items-center gap-1.5 px-4 text-[var(--accent)] md:px-5'>
        <span aria-label={t('music.shared_playlist')}><Logo size={15} /></span>
        <span className='flex-1' />
        <Tooltip label={t('share.switch_theme')} side='left'>
          <button
            type='button'
            onClick={onToggleTheme}
            aria-label={t('share.switch_theme')}
            className='inline-flex size-9 items-center justify-center rounded-[var(--r-md)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] md:size-7'
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </Tooltip>
      </div>
    </header>
  )
}

function NowPlayingBar({ track, onNext }: {
  track: PublicPlaylist['tracks'][number]
  onNext?: () => void
}) {
  // Keyed on the track id: the browser restarts playback of the new src, and the
  // native controls stay the only transport a reader without a session needs.
  const media = {
    key: track.id,
    src: track.streamUrl,
    controls: true,
    autoPlay: true,
    onEnded: () => onNext?.(),
  }
  // A video container in an <audio> element plays its sound and hides its picture, so the
  // anonymous reader gets a black box for a clip; the element follows the stored mime.
  const isVideo = isVideoMime(track.mime)
  return (
    <div className='fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur'>
      <div className='mx-auto max-w-215 py-2 md:px-1'>
        <p className='truncate text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
          {track.title}
          {track.artist ? <span className='font-normal text-[var(--text-tertiary)]'> · {track.artist}</span> : null}
        </p>
        {isVideo
          ? <video {...media} playsInline className='max-h-60 w-full' />
          : <audio {...media} className='w-full' />}
      </div>
    </div>
  )
}

function PlaylistBody({ load, currentId, onPlay, coverUrl, trackCount, totalDurationMs }: {
  load: Load
  currentId: string | null
  onPlay: (id: string) => void
  coverUrl: string | null
  trackCount: number
  totalDurationMs: number
}) {
  if (load.status === 'loading') {
    return <div className='pt-24'><LoadingBlock label={t('common.loading')} /></div>
  }
  if (load.status !== 'ready') {
    return (
      <div className='mx-auto max-w-95 pt-[18vh] text-center'>
        <h1 className='text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]'>{t('music.shared_playlist')}</h1>
        <p role='alert' className='mt-2 text-[length:var(--text-13)] leading-relaxed text-[var(--text-tertiary)]'>
          {load.status === 'unavailable' ? t('music.playlist_link_gone') : t('music.playlist_link_failed')}
        </p>
      </div>
    )
  }
  const { playlist } = load
  return (
    <>
      <PlaylistHead playlist={playlist} coverUrl={coverUrl} trackCount={trackCount} totalDurationMs={totalDurationMs} />
      {playlist.tracks.length === 0
        ? <Empty art='select' title={t('music.playlist_empty')} compact />
        : (
          <ol className='mt-3'>
            {playlist.tracks.map((track) => (
              <li key={track.id}>
                <button
                  type='button'
                  onClick={() => onPlay(track.id)}
                  aria-current={track.id === currentId ? 'true' : undefined}
                  className='flex w-full items-center gap-3 rounded-[var(--r-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
                >
                  <MusicArtwork url={track.coverUrl} alt='' className='size-9 shrink-0 rounded-[var(--r-sm)]' iconSize={14} />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[length:var(--text-13)] text-[var(--text-primary)]'>{track.title}</span>
                    <span className='block truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
                      {track.artist || t('music.unknown_artist')}
                    </span>
                  </span>
                  <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{formatDuration(track.durationMs)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
    </>
  )
}

function PlaylistHead({ playlist, coverUrl, trackCount, totalDurationMs }: {
  playlist: PublicPlaylist
  coverUrl: string | null
  trackCount: number
  totalDurationMs: number
}) {
  return (
    <div className='flex items-end gap-4 pt-6'>
      <MusicArtwork url={coverUrl} alt='' className='size-28 shrink-0 rounded-[var(--r-lg)]' iconSize={32} />
      <div className='min-w-0'>
        <p className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>{t('music.shared_playlist')}</p>
        <h1 className='truncate text-[length:var(--text-16)] font-bold text-[var(--text-primary)]'>{playlist.name}</h1>
        {playlist.description && (
          <p className='mt-1 line-clamp-2 text-[length:var(--text-12)] text-[var(--text-secondary)]'>{playlist.description}</p>
        )}
        <p className='mt-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {t('music.playlist_track_count', { value0: trackCount })} · {formatTotalDuration(totalDurationMs)}
        </p>
      </div>
    </div>
  )
}
