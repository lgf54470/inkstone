import { Bot, Monitor, Smartphone, Tablet, User } from 'lucide-react'
import type { ShareVisitsResponse } from '@shared/types'
import { Skeleton } from '../../components/feedback'
import { relativeTime } from '../../lib/time'
import { t, useLocale } from '../../lib/i18n'
import { countryFlag, countryNameLocalized, localizeEnvName } from './share-helpers'
import type { useShareVisitLogs } from './use-share-visit-logs-modal'

type LogsBundle = ReturnType<typeof useShareVisitLogs>

const SKELETON_ROWS = [0, 1, 2, 3, 4]

/**
 * The rows the logs request answered with, or the state the request is in when it has not answered
 * yet: the loading rows are placeholders and the empty row is a fact ("nothing matched"), and each
 * of the three reads differently on purpose.
 */
export function LogsTable({ bundle }: { bundle: LogsBundle }) {
  const { data, isLoading } = bundle
  return (
    <div className='max-h-115 overflow-auto rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)]'>
      <table className='w-full border-collapse text-left text-[length:var(--text-12)]'>
        <LogsTableHeader />
        <tbody className='divide-y divide-[var(--border-subtle)]' aria-busy={isLoading}>
          {data && data.visits.length > 0 ? (
            data.visits.map((log) => (
              <LogRow key={log.id} log={log} />
            ))
          ) : isLoading ? (
            <LogsTableSkeleton />
          ) : (
            <tr>
              <td colSpan={7} className='py-12 text-center text-[var(--text-quaternary)]'>
                {t('share.no_logs_found')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A page that has been asked for and not answered yet is loading, not empty. Five rows stand in as
 * shimmer so the first fetch (and a search that is still running) can never read as "no logs found
 * matching filters" — a claim about the data that the request had not made yet.
 */
function LogsTableSkeleton() {
  return (
    <>
      {SKELETON_ROWS.map((row) => (
        <tr key={row}>
          <td colSpan={7} className='px-3 py-2'>
            <Skeleton className='h-4' />
          </td>
        </tr>
      ))}
    </>
  )
}

function LogsTableHeader() {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)] text-[length:var(--text-11)] text-[var(--text-tertiary)] uppercase tracking-wider'>
      <tr>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_time')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_note')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_location')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_referrer')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_client')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_type')}</th>
        <th scope='col' className='px-3 py-2 font-medium'>{t('share.col_fp')}</th>
      </tr>
    </thead>
  )
}

type VisitLog = ShareVisitsResponse['visits'][number]

function LogRow({ log }: {
  log: VisitLog
}) {
  const flag = countryFlag(log.country)
  const countryName = countryNameLocalized(log.country, useLocale())
  return (
    <tr className='transition-colors hover:bg-[var(--bg-hover)]'>
      <VisitTimeCell log={log} />
      <VisitNoteCell log={log} />
      <VisitLocationCell log={log} flag={flag} countryName={countryName} />
      <VisitReferrerCell log={log} />
      <VisitClientCell log={log} />
      <td className='whitespace-nowrap px-3 py-2'>
        <VisitTypeBadge log={log} />
      </td>
      <td className='whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        {log.visitorFp || '-'}
      </td>
    </tr>
  )
}

function VisitTimeCell({ log }: { log: VisitLog }) {
  const locale = useLocale()
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex flex-col'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-primary)]'>
          {relativeTime(log.visitedAt)}
        </span>
        <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {new Date(log.visitedAt).toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>
    </td>
  )
}

function VisitNoteCell({ log }: { log: VisitLog }) {
  return (
    <td className='px-3 py-2'>
      <div className='flex flex-col max-w-40'>
        <span className='truncate font-medium text-[length:var(--text-12)] text-[var(--text-primary)]'>
          {log.noteTitle || t('common.untitled_note')}
        </span>
        <span className='truncate font-mono text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {`/s/${log.slug}`}
        </span>
      </div>
    </td>
  )
}

function VisitLocationCell({ log, flag, countryName }: {
  log: VisitLog
  flag: string
  countryName: string
}) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex items-center gap-1.5'>
        <span className='text-[length:var(--text-14)]'>{flag}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          {log.city ? `${countryName}, ${log.city}` : countryName}
        </span>
      </div>
    </td>
  )
}

function VisitReferrerCell({ log }: { log: VisitLog }) {
  return (
    <td className='px-3 py-2'>
      <span className='max-w-35 truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {log.referrerHost || (
          <span className='italic text-[var(--text-quaternary)]'>
            {t('share.direct_access')}
          </span>
        )}
      </span>
    </td>
  )
}

function VisitClientCell({ log }: { log: VisitLog }) {
  return (
    <td className='whitespace-nowrap px-3 py-2'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
        {deviceIcon(log.deviceType)}
        <span>
          {localizeEnvName(log.browser)} / {localizeEnvName(log.os)}
        </span>
      </div>
    </td>
  )
}

function VisitTypeBadge({ log }: {
  log: ShareVisitsResponse['visits'][number]
}) {
  if (log.isBot) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-[var(--warning)]/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--warning)] border border-[var(--warning)]/20'>
        <Bot size={11} /> {log.botName || t('share.badge_bot')}
      </span>
    )
  }
  if (log.isOwner) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--accent)] border border-[var(--accent)]/20'>
        <User size={11} /> {t('share.badge_owner')}
      </span>
    )
  }
  if (log.isSelfReferrer) {
    return (
      <span className='inline-flex items-center gap-1 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--text-secondary)] border border-[var(--border-default)]'>
        {t('share.badge_self_referrer')}
      </span>
    )
  }
  return (
    <span className='inline-flex items-center gap-1 rounded bg-[var(--success)]/10 px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--success)] border border-[var(--success)]/20'>
      {t('share.badge_human')}
    </span>
  )
}

function deviceIcon(type?: string | null) {
  if (type === 'mobile') return <Smartphone size={12} className='text-[var(--text-tertiary)]' />
  if (type === 'tablet') return <Tablet size={12} className='text-[var(--text-tertiary)]' />
  return <Monitor size={12} className='text-[var(--text-tertiary)]' />
}
