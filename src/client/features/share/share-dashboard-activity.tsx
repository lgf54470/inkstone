import { Activity, ExternalLink } from 'lucide-react'
import type { ShareGlobalAnalytics } from '@shared/types'
import { Button } from '../../components/primitives'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { countryFlag, countryNameLocalized, localizeEnvName } from './share-helpers'
import { EmptyRow } from './share-dashboard-card-shell'

/** The newest visits, with a way into the full logs. */
export function RecentActivityCard({ analytics, onOpenLogs, locale }: {
  analytics: ShareGlobalAnalytics | null
  onOpenLogs?: () => void
  locale: string
}) {
  const recentVisits = analytics?.recentVisits ?? []
  return (
    <div className='mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between pb-3'>
        <div className='flex items-center gap-2'>
          <h3 className='flex items-center gap-1.5 text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
            <Activity size={15} className='text-[var(--accent)]' />
            {t('share.recent_activity_title')}
          </h3>
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            {t('share.realtime_stream')}
          </span>
        </div>
        {onOpenLogs && (
          <Button
            variant='ghost'
            size='sm'
            onClick={onOpenLogs}
            trailing={<ExternalLink size={12} />}
            className='h-auto px-0 text-[length:var(--text-11)] font-medium text-[var(--accent)] hover:bg-transparent hover:underline'
          >
            {t('share.view_all_logs')}
          </Button>
        )}
      </div>

      <div className='divide-y divide-[var(--border-subtle)] pt-1'>
        {recentVisits.length === 0 ? (
          <EmptyRow label={t('share.no_visits_yet')} />
        ) : (
          recentVisits.map((v) => (
            <RecentVisitRow key={v.id} visit={v} locale={locale} />
          ))
        )}
      </div>
    </div>
  )
}

function RecentVisitRow({ visit, locale }: {
  visit: ShareGlobalAnalytics['recentVisits'][number]
  locale: string
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-12)]'>
      <div className='flex items-center gap-2'>
        <span>{countryFlag(visit.country)}</span>
        <span className='font-medium text-[var(--text-primary)]'>
          {visit.noteTitle || t('common.untitled_note')}
        </span>
        <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          ({countryNameLocalized(visit.country, locale)}
          {visit.city ? ` · ${visit.city}` : ''})
        </span>
        <VisitBadges visit={visit} />
      </div>

      <div className='flex items-center gap-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        <span className='rounded bg-[var(--bg-base)] px-1.5 py-0.5 font-mono'>
          {localizeEnvName(visit.browser)} / {localizeEnvName(visit.os)}
        </span>
        {visit.referrerHost && (
          <span className='max-w-30 truncate'>{visit.referrerHost}</span>
        )}
        <span className='font-mono'>{relativeTime(visit.visitedAt)}</span>
      </div>
    </div>
  )
}

/** The flags that say why a visit may not be a plain reader. */
function VisitBadges({ visit }: {
  visit: ShareGlobalAnalytics['recentVisits'][number]
}) {
  return (
    <>
      {visit.isBot && (
        <span className='rounded bg-[var(--danger-soft)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--danger)]'>
          🤖 {visit.botName || t('share.badge_bot')}
        </span>
      )}
      {visit.isOwner && (
        <span className='rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--accent)]'>
          👤 {t('share.badge_owner')}
        </span>
      )}
      {visit.isSelfReferrer && (
        <span className='rounded bg-[var(--warning-soft)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--warning)]'>
          {t('share.badge_self_referrer')}
        </span>
      )}
    </>
  )
}
