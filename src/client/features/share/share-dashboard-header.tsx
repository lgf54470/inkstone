import { RefreshCw } from 'lucide-react'
import type { ShareTimelineRange } from '@shared/types'
import { Segmented, Switch } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { relativeTime } from '../../lib/time'
import { rangeOptions } from './share-helpers'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'
import type { useShareDashboardView } from './use-share-dashboard-view'

type DashboardBundle = ReturnType<typeof useShareDashboardView>

/** The dashboard's title, its range control, and the two ways to re-ask for the same window. */
export function DashboardHeader({ bundle }: { bundle: DashboardBundle }) {
  const { loadedAt } = bundle
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 pb-4'>
      <div>
        <h2 className='text-[length:var(--text-18)] font-bold text-[var(--text-primary)]'>
          {t('share.analytics_dashboard_title')}
        </h2>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
          {t('share.analytics_dashboard_subtitle')}
        </p>
        {/* The dashboard reads every share, whatever folder or tag the sidebar has selected: saying
            so is the difference between a wrong number and a stated scope. */}
        <p className='pt-0.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('share.analytics_dashboard_scope')}
        </p>
        {/* The age of what is on screen, stated rather than implied: without it a person cannot
            tell a quiet week from a tab opened before lunch. */}
        {loadedAt !== null && (
          <p className='pt-0.5 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            {t('share.analytics_updated_at', { time: relativeTime(loadedAt) })}
          </p>
        )}
      </div>

      <DashboardControls bundle={bundle} />
    </div>
  )
}

/** The range, the traffic filters, and the two ways to keep the window fresh: by hand, or on a cadence. */
function DashboardControls({ bundle }: { bundle: DashboardBundle }) {
  const { range, setRange, isLoading, loadData, autoRefresh, setAutoRefresh } = bundle
  return (
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

      <span className='whitespace-nowrap text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {t('share.auto_refresh')}
      </span>
      <Switch checked={autoRefresh} onChange={setAutoRefresh} label={t('share.auto_refresh')} />
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
