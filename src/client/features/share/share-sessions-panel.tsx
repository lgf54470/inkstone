import { Clock, Fingerprint, Loader2, Route } from 'lucide-react'
import type { ShareSession } from '@shared/types'
import { Button } from '../../components/primitives'
import { t, useLocale } from '../../lib/i18n'
import { formatNumber, relativeTime } from '../../lib/time'
import { useSession } from '../../store/session'
import { visitorCountNote } from './share-helpers'
import { LoadErrorState } from './share-load-error'

type SessionsBundle = {
  sessions: ShareSession[]
  isLoading: boolean
  isAppending: boolean
  hasError: boolean
  hasMore: boolean
  loadMore: () => void
  reload: () => void
}

/**
 * One visitor's sittings, newest first (ADR-0003). A real table rather than rows of divs, because
 * the point of this view is the comparison across columns — when it started, how long it ran, how
 * many visits, and what was read in between. The note list carries the reading order, which is the
 * question this panel exists to answer.
 */
export function ShareSessionsPanel({ bundle }: { bundle: SessionsBundle }) {
  const { sessions, isLoading, isAppending, hasError, hasMore, loadMore, reload } = bundle
  // A session is a run of one fingerprint: an instance that keeps none has no sessions to show, and
  // the note below has to say that rather than describe a caliber nothing was counted with.
  const fingerprints = useSession((s) => s.site?.visitorFingerprints ?? true)
  if (hasError && sessions.length === 0) {
    return <LoadErrorState label={t('share.sessions_load_failed')} onRetry={reload} />
  }
  return (
    <div className='flex flex-col gap-3'>
      <div className='max-h-115 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)]'>
        <table className='w-full border-collapse text-left text-[length:var(--text-12)]'>
          <SessionsTableHeader />
          <tbody className='divide-y divide-[var(--border-subtle)]'>
            {sessions.length > 0 ? (
              sessions.map((session) => <SessionRow key={`${session.fingerprint}-${session.startedAt}`} session={session} />)
            ) : (
              <tr>
                <td colSpan={4} className='py-12 text-center text-[var(--text-quaternary)]'>
                  {isLoading ? t('common.loading') : t('share.sessions_empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isLoading && <SessionsStatus label={t('share.sessions_loading')} />}
      {hasError && sessions.length > 0 && <SessionsStatus label={t('share.sessions_load_failed')} tone='danger' />}
      {hasMore && (
        <div className='flex justify-center'>
          <Button size='sm' variant='secondary' icon={isAppending ? <Loader2 size={12} className='animate-spin' /> : <Clock size={12} />} disabled={isAppending} onClick={loadMore}>
            {t('share.sessions_load_more')}
          </Button>
        </div>
      )}
      {/* What a session is, and what it is not: one fingerprint is not one person, and the salt
          rotates at UTC midnight, so a sitting can never span two days. */}
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {t('share.sessions_hint')}
      </p>
      <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {visitorCountNote(fingerprints)}
      </p>
    </div>
  )
}

function SessionsStatus({ label, tone }: { label: string; tone?: 'danger' }) {
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={tone === 'danger' ? 'text-[length:var(--text-11)] text-[var(--danger)]' : 'text-[length:var(--text-11)] text-[var(--text-tertiary)]'}>
      {label}
    </p>
  )
}

function SessionsTableHeader() {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[length:var(--text-11)] text-[var(--text-tertiary)] uppercase tracking-wider'>
      <tr>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_fp')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.sessions_col_started')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.sessions_col_span')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.sessions_col_read')}</th>
      </tr>
    </thead>
  )
}

function SessionRow({ session }: { session: ShareSession }) {
  return (
    <tr className='align-top transition-colors hover:bg-[var(--bg-hover)]'>
      <td className='whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        <span className='inline-flex items-center gap-1'>
          <Fingerprint size={11} aria-hidden />
          {session.fingerprint || '-'}
        </span>
      </td>
      <SessionTimingCell session={session} />
      <SessionVisitCountCell session={session} />
      <SessionNotesCell notes={session.notes} />
    </tr>
  )
}

function SessionTimingCell({ session }: { session: ShareSession }) {
  const locale = useLocale()
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex flex-col'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-primary)]'>
          {relativeTime(session.startedAt)}
        </span>
        <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {new Date(session.startedAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </td>
  )
}

function SessionVisitCountCell({ session }: { session: ShareSession }) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex flex-col'>
        <span className='inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          <Route size={11} aria-hidden />
          {t('share.sessions_visits', { count: session.visits })}
        </span>
        <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {t('share.sessions_last_seen', { time: relativeTime(session.lastSeenAt) })}
        </span>
      </div>
    </td>
  )
}

function SessionNotesCell({ notes }: { notes: ShareSession['notes'] }) {
  return (
    <td className='px-3 py-2'>
      <ul className='flex flex-col gap-1.5'>
        {notes.map((note) => (
          <li key={note.noteId} className='flex items-baseline gap-1.5'>
            <span className='flex max-w-45 flex-col'>
              <span className='truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>
                {note.noteTitle || t('common.untitled_note')}
              </span>
              {/* The path is the stable half: a title is renamed, and a deleted note keeps only
                  its slug, which is what the log row shows too. */}
              <span className='truncate font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
                {`/s/${note.slug}`}
              </span>
            </span>
            <span className='whitespace-nowrap text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
              {formatNumber(note.visits)} ×
            </span>
          </li>
        ))}
      </ul>
    </td>
  )
}
