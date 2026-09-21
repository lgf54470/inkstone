import { Eraser, MoonStar } from 'lucide-react'
import type { ShareStaleLink } from '@shared/types'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { CardHeader, EmptyRow } from './share-dashboard-card-shell'
import { daysSinceVisit } from './share-stale-links-actions'
import type { useShareDashboardView } from './use-share-dashboard-view'

type DashboardBundle = ReturnType<typeof useShareDashboardView>

/**
 * SH-70: the links nobody reads any more, and the one action that answers them. It reads the same
 * analytics response as the rest of the dashboard, so it costs no extra request, and the threshold
 * it reports is the account's own setting — stated in the badge, because "quiet" is only meaningful
 * next to the number of days it means.
 */
export function StaleLinksCard({ bundle }: { bundle: DashboardBundle }) {
  const { analytics, staleLinks, isStaleBusy, pauseStaleLinks } = bundle
  const thresholdDays = staleLinks?.thresholdDays ?? 0
  // 0 is the owner's off switch: the server sends nothing to report, so there is nothing to draw.
  if (!analytics || thresholdDays === 0) return null
  const total = staleLinks?.total ?? 0
  return (
    <div className='mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader
        icon={<MoonStar size={15} className='text-[var(--accent)]' />}
        title={t('share.stale_links_title')}
        badge={t('share.stale_links_badge', { days: thresholdDays })}
      />
      {total === 0 ? (
        <EmptyRow label={t('share.stale_links_empty', { days: thresholdDays })} />
      ) : (
        <>
          <p className='pt-3 text-[length:var(--text-12)] text-[var(--text-secondary)]'>
            {t('share.stale_links_summary', { count: total, never: staleLinks?.neverViewed ?? 0 })}
          </p>
          <div className='divide-y divide-[var(--border-subtle)] pt-1'>
            {(staleLinks?.items ?? []).map((item) => (
              <StaleLinkRow key={item.noteId} item={item} />
            ))}
          </div>
          {/* The list is what gets paused, and it is a page of the total: saying "these" keeps the
              button from standing in for links that are not on screen. */}
          <div className='flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]'>
            <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
              {t('share.stale_pause_scope', { count: staleLinks?.items.length ?? 0 })}
            </span>
            <Button
              size='sm'
              variant='secondary'
              icon={<Eraser size={13} />}
              disabled={isStaleBusy}
              onClick={() => void pauseStaleLinks()}
            >
              {t('share.stale_pause_action')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function StaleLinkRow({ item }: { item: ShareStaleLink }) {
  const days = daysSinceVisit(item.lastViewedAt)
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 py-2 text-[length:var(--text-12)]'>
      <span className='truncate font-medium text-[var(--text-primary)]'>
        {item.noteTitle || t('common.untitled_note')}
      </span>
      <span className='flex items-center gap-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        <span className='font-mono'>{`/s/${item.slug}`}</span>
        <span>
          {days === null ? t('share.stale_never_viewed') : t('share.stale_last_viewed', { days })}
        </span>
      </span>
    </div>
  )
}
