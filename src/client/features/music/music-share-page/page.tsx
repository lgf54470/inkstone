import { useEffect, useMemo, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { isVideoMime } from '@shared/music-media'
import type { PublicPlaylist, PublicPlaylistTrack } from '../../../lib/api'
import { api, ApiError } from '../../../lib/api'
import { Logo } from '../../../components/primitives'
import { Empty, LoadingBlock } from '../../../components/feedback'
import { Tooltip } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { formatTimecode, formatTotalDuration } from '../../../lib/time'
import { MusicArtwork } from '../music-artwork'
import { forgetPlaylistVisit, newestTrackAt, readPlaylistVisit, rememberPlaylistVisit, tracksSinceVisit } from './visit-memory'

type Load =
  | { status: 'loading' }
  | { status: 'ready'; playlist: PublicPlaylist }
  | { status: 'unavailable' }
  | { status: 'failed' }

// Reading the playlist and reporting what is new are one effect because they are one answer: the
// comparison is made against the stamp the last visit left, and it is what the payload resolves with.
//
// The claim is a pure read, and that is what keeps it honest. React runs effects twice under
// StrictMode, so a claim that wrote the stamp it had just compared would be read back by the second
// run as "nothing is new" — and the run a reader sees is the last one, which would leave the reminder
// reported and then withdrawn. Writing the stamp is left to `useRememberVisit`, which the teardown
// below performs once the visit is over.
function useSharedPlaylist(slug: string): { load: Load; newTrackIds: ReadonlySet<string>; forgetVisit: () => void } {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [newTrackIds, setNewTrackIds] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    api.music.publicPlaylist(slug)
      .then((playlist) => {
        setNewTrackIds(new Set(tracksSinceVisit(playlist.tracks, readPlaylistVisit(slug).lastSeenAt)))
        if (!cancelled) setLoad({ status: 'ready', playlist })
      })
      .catch((error) => {
        if (!cancelled) {
          setLoad(error instanceof ApiError && error.status === 404 ? { status: 'unavailable' } : { status: 'failed' })
        }
      })
    return () => { cancelled = true }
  }, [slug])
  const forgetVisit = () => {
    forgetPlaylistVisit(slug)
    setNewTrackIds(new Set())
  }
  useRememberVisit(slug, load.status === 'ready' ? load.playlist.tracks : null)
  return { load, newTrackIds, forgetVisit }
}

// The visit is remembered as the document goes away, not as it arrives, and what it remembers is the
// newest track the reader was actually shown. `pagehide` is the one moment that covers a reload, a
// close and the back button; a track added while the page is open is not in that payload, so the next
// visit still has it to report. Only the listener is torn down on unmount — a write there would be the
// same write-at-arrival this avoids, since StrictMode unmounts the effect once before the real mount.
function useRememberVisit(slug: string, tracks: PublicPlaylistTrack[] | null): void {
  useEffect(() => {
    if (!tracks) return
    const seenAt = newestTrackAt(tracks)
    if (seenAt === null) return
    const remember = () => rememberPlaylistVisit(slug, seenAt)
    window.addEventListener('pagehide', remember)
    return () => window.removeEventListener('pagehide', remember)
  }, [slug, tracks])
}

// The anonymous half of M-51: a shared playlist opens for anyone at
// /playlist/:slug with no session, so this page never touches the music store.
export function MusicPlaylistSharePage({ slug }: { slug: string }) {
  const { load, newTrackIds, forgetVisit } = useSharedPlaylist(slug)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const { dark, toggleTheme } = useDocumentTheme()

  const playlist = load.status === 'ready' ? load.playlist : null
  const tracks = playlist?.tracks ?? []
  const currentIndex = tracks.findIndex((track) => track.id === currentId)
  const current = currentIndex >= 0 ? tracks[currentIndex] : null
  const totalDurationMs = useMemo(() => tracks.reduce((sum, track) => sum + track.durationMs, 0), [tracks])
  const coverUrl = playlist?.coverUrl ?? tracks.find((track) => track.coverUrl)?.coverUrl ?? null

  return (
    <div className='h-full overflow-y-auto overscroll-contain bg-[var(--bg-base)]'>
      <ShareTopBar dark={dark} onToggleTheme={toggleTheme} />
      <main className='mx-auto max-w-215 px-4 pb-[calc(120px+env(safe-area-inset-bottom))] md:px-5 md:pb-32'>
        <PlaylistBody
          load={load}
          currentId={currentId}
          onPlay={setCurrentId}
          coverUrl={coverUrl}
          trackCount={tracks.length}
          totalDurationMs={totalDurationMs}
          newTrackIds={newTrackIds}
          onForgetVisit={forgetVisit}
        />
      </main>
      {current && (
        // Keyed on the track: the bar's own failure state belongs to the track it was drawn for, so a
        // new track is a new bar and the message goes away with the old one instead of being cleared
        // by hand.
        <NowPlayingBar
          key={current.id}
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
        <Logo size={15} />
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

// The theme of an anonymous page is the document's own: there is no account to read a preference from,
// so the toggle writes it here and reads it back on the next click.
function useDocumentTheme(): { dark: boolean; toggleTheme: () => void } {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
  }
  return { dark, toggleTheme }
}

function NowPlayingBar({ track, onNext }: {
  track: PublicPlaylist['tracks'][number]
  onNext?: () => void
}) {
  // A track that will not play is the one failure this page has to name itself: the visitor has no
  // library, no queue and no second source, and the control the browser draws gives them nothing — the
  // element simply never starts. The bar is mounted per track by its parent, so the message belongs
  // here; the control is the retry, since a press asks for the stream again.
  const [failed, setFailed] = useState(false)
  // Keyed on the track id: the browser restarts playback of the new src, and the
  // native controls stay the only transport a reader without a session needs.
  const media = {
    src: track.streamUrl,
    controls: true,
    autoPlay: true,
    onEnded: () => onNext?.(),
    // The element reports its own failure, and this is the page saying so out loud.
    onError: () => setFailed(true),
  }
  // A video container in an <audio> element plays its sound and hides its picture, so the
  // anonymous reader gets a black box for a clip; the element follows the stored mime.
  const isVideo = isVideoMime(track.mime)
  // A landmark with its own name, because this strip is outside the page's `main` and the failure
  // sentence it can carry has to be reachable by landmark navigation as well as by reading straight
  // through: a `div` here left the page's only transport outside every landmark (axe's `region`).
  return (
    <section
      aria-label={t('music.now_playing')}
      className='fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur'
    >
      <div className='mx-auto max-w-215 py-2 md:px-1'>
        {failed && (
          <p role='alert' className='mb-1 text-[length:var(--text-11)] leading-relaxed text-[var(--danger)]'>
            {t('music.playback_failed')}
          </p>
        )}
        <p className='truncate text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
          {track.title}
          {track.artist ? <span className='font-normal text-[var(--text-tertiary)]'> · {track.artist}</span> : null}
        </p>
        {isVideo
          ? <video key={track.id} {...media} playsInline className='max-h-60 w-full' />
          : <audio key={track.id} {...media} className='w-full' />}
      </div>
    </section>
  )
}

function PlaylistBody({ load, currentId, onPlay, coverUrl, trackCount, totalDurationMs, newTrackIds, onForgetVisit }: {
  load: Load
  currentId: string | null
  onPlay: (id: string) => void
  coverUrl: string | null
  trackCount: number
  totalDurationMs: number
  newTrackIds: ReadonlySet<string>
  onForgetVisit: () => void
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
      {newTrackIds.size > 0 && <VisitNotice count={newTrackIds.size} onForget={onForgetVisit} />}
      {playlist.tracks.length === 0
        ? <Empty art='select' title={t('music.playlist_empty')} compact />
        : (
          <ol className='mt-3'>
            {playlist.tracks.map((track) => (
              <PlaylistTrackRow
                key={track.id}
                track={track}
                current={track.id === currentId}
                isNew={newTrackIds.has(track.id)}
                onPlay={onPlay}
              />
            ))}
          </ol>
        )}
    </>
  )
}

// The reminder is announced rather than silent (a returning reader should not have to spot a badge on
// their own), and it says where the memory lives so nobody reads it as a server-side subscription.
// The one control forgets the stamp, which stops the comparison on later visits and hides it now.
// Emphasis comes from an accent rule, not from an accent-soft fill: on that fill only the top text
// level is calibrated, and the dim levels this notice needs would fall under AA.
function VisitNotice({ count, onForget }: { count: number; onForget: () => void }) {
  return (
    <div role='status' className='mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-[var(--accent)] pl-2.5'>
      <span className='text-[length:var(--text-12)] text-[var(--accent)]'>
        {t('music.share_new_since_visit', { value0: count })}
      </span>
      <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{t('music.share_visit_memory_note')}</span>
      <button
        type='button'
        onClick={onForget}
        className='ml-auto shrink-0 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
      >
        {t('music.share_forget_visit')}
      </button>
    </div>
  )
}

function PlaylistTrackRow({ track, current, isNew, onPlay }: {
  track: PublicPlaylistTrack
  current: boolean
  isNew: boolean
  onPlay: (id: string) => void
}) {
  return (
    <li>
      <button
        type='button'
        onClick={() => onPlay(track.id)}
        aria-current={current ? 'true' : undefined}
        className='flex w-full items-center gap-3 rounded-[var(--r-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
      >
        <MusicArtwork url={track.coverUrl} alt='' className='size-9 shrink-0 rounded-[var(--r-sm)]' iconSize={14} />
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-[length:var(--text-13)] text-[var(--text-primary)]'>{track.title}</span>
          <span className='block truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {track.artist || t('music.unknown_artist')}
          </span>
        </span>
        {isNew && (
          <span className='shrink-0 rounded-[var(--r-full)] bg-[var(--accent-soft)] px-1.5 text-[length:var(--text-10)] font-semibold text-[var(--accent)]'>
            {t('music.share_new_badge')}
          </span>
        )}
        <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{formatTimecode(track.durationMs)}</span>
      </button>
    </li>
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
