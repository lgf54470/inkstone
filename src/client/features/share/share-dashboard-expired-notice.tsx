import { BellOff, TriangleAlert } from 'lucide-react'
import type { ShareExpiredLinks } from '@shared/types'
import { Button } from '../../components/primitives'
import { fullTime } from '../../lib/time'
import { t } from '../../lib/i18n'

/**
 * The expiry notice (audit #7): the dashboard answers "something lapsed since you last looked"
 * before the KPIs answer anything else. Dismissing stamps one timestamp — the notice only ever
 * returns what lapsed after it — and "view" hands over to the hub's expired category, where the
 * lapsed links already have their own shelf.
 */
export function ShareExpiredNoticeCard({ expiredLinks, onAcknowledge, onViewExpired }: {
  expiredLinks: ShareExpiredLinks
  onAcknowledge: () => void
  onViewExpired: () => void
}) {
  return (
    <section
      role='status'
      aria-label={t('share.expired_notice_title')}
      className='rounded-[var(--r-lg)] border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-4'
    >
      <div className='flex items-center justify-between gap-2'>
        <p className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--warning)]'>
          <TriangleAlert size={14} aria-hidden />
          {t('share.expired_notice_title', { count: expiredLinks.total })}
        </p>
        <Button size='sm' variant='ghost' icon={<BellOff size={12} />} onClick={onAcknowledge}>
          {t('share.expired_notice_dismiss')}
        </Button>
      </div>
      <ul className='space-y-1 pt-2'>
        {expiredLinks.items.map((item) => (
          <li key={item.slug} className='flex flex-wrap items-baseline justify-between gap-x-3 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
            <span className='truncate'>
              {item.noteTitle || t('common.untitled_note')}
              <span className='ml-2 font-mono text-[var(--text-quaternary)]'>{`/s/${item.slug}`}</span>
            </span>
            <span>{t('share.expired_notice_lapsed_at', { time: fullTime(item.expiresAt) })}</span>
          </li>
        ))}
      </ul>
      {expiredLinks.total > expiredLinks.items.length && (
        <p className='pt-1.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {t('share.expired_notice_more', { count: expiredLinks.total - expiredLinks.items.length })}
        </p>
      )}
      <div className='pt-2'>
        <Button size='sm' variant='secondary' onClick={onViewExpired}>
          {t('share.expired_notice_view_expired')}
        </Button>
      </div>
    </section>
  )
}
