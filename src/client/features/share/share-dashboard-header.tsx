import { RefreshCw } from 'lucide-react'
import type { ShareTimelineRange } from '@shared/types'
import { Segmented } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { rangeOptions } from './share-helpers'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'
import type { useShareDashboardView } from './use-share-dashboard-view'

type DashboardBundle = ReturnType<typeof useShareDashboardView>

/** The dashboard's title, its range control, and the two ways to re-ask for the same window. */
export function DashboardHeader({ bundle }: { bundle: DashboardBundle }) {
  const { range, setRange, isLoading, loadData } = bundle
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 pb-4'>
      <div>
        <h2 className='text-[length:var(--text-18)] font-bold text-[var(--text-primary)]'>
          {t('share.analytics_dashboard_title')}
        </h2>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
          {t('share.analytics_dashboard_subtitle')}
        </p>
      </div>

      <div className='flex items-center gap-2'>
        <Segmented
          label={t('share.range_label')}
          options={rangeOptions()}
          value={range}
          onChange={(val) => setRange(val as ShareTimelineRange)}
        />

        <ShareTrafficFilterPopover />

        <IconButton
          size='sm'
          label={t('common.refresh')}
          disabled={isLoading}
          onClick={() => void loadData(range)}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

/** What the traffic filters took out of the numbers below, drawn only when they took something. */
export function FilterSummaryBanner({ bundle }: { bundle: DashboardBundle }) {
  const { filteredBots, filteredSelf, filteredOwner } = bundle
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
      <div className='flex items-center gap-2'>
        <span className='flex h-2 w-2 rounded-full bg-[var(--success)]' />
        <span>
          {t('share.filter_stats_summary', {
            bots: filteredBots,
            self: filteredSelf,
            owner: filteredOwner,
          })}
        </span>
      </div>
      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {t('share.filter_real_traffic_active')}
      </span>
    </div>
  )
}
