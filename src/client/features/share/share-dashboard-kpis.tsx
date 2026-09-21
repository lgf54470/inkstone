import { Activity, Globe2, MousePointerClick, Users } from 'lucide-react'
import type { ShareGlobalAnalytics } from '@shared/types'
import { KpiCard } from '../../components/dashboard-blocks'
import { t } from '../../lib/i18n'

/** The four headline numbers, above every card. */
export function KpiGrid({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <KpiCard
        icon={<MousePointerClick size={16} className='text-[var(--accent)]' />}
        label={t('share.total_views_pv')}
        value={analytics?.totalViews ?? 0}
        delta={analytics?.viewsDelta}
        deltaHint={t('share.delta_vs_previous')}
        sparkline={analytics?.sparklineViews}
      />

      <KpiCard
        icon={<Users size={16} className='text-[var(--success)]' />}
        label={t('share.total_visitors_uv')}
        value={analytics?.totalVisitors ?? 0}
        delta={analytics?.visitorsDelta}
        deltaHint={t('share.delta_vs_previous')}
        sparkline={analytics?.sparklineVisitors}
      />

      <ActiveSharesCard analytics={analytics} />

      <KpiCard
        icon={<Activity size={16} className='text-[var(--warning)]' />}
        label={t('share.views_per_day')}
        value={analytics?.viewsPerDay ?? 0}
        delta={analytics?.viewsPerDayDelta}
        deltaHint={t('share.delta_vs_previous')}
      />
    </div>
  )
}

/** How many shares are live right now, against how many exist — the one share-shaped KPI. */
function ActiveSharesCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  return (
    <div className='flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between text-[var(--text-tertiary)]'>
        <span className='text-[length:var(--text-12)] font-medium'>{t('share.active_shares_count')}</span>
        <Globe2 size={16} className='text-[var(--accent)]' />
      </div>
      <div className='pt-2'>
        <div className='text-[length:var(--text-24)] font-bold tracking-tight text-[var(--text-primary)]'>
          {analytics?.activeShares ?? 0}
          <span className='ml-1.5 text-[length:var(--text-12)] font-normal text-[var(--text-tertiary)]'>
            / {analytics?.totalShares ?? 0} {t('share.shares_unit')}
          </span>
        </div>
        <p className='pt-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('share.active_shares_hint')}
        </p>
      </div>
    </div>
  )
}
