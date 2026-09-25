import { t } from '../../lib/i18n'
import { LoadErrorState } from './share-load-error'
import { ShareDashboardLoading } from './share-dashboard-loading'
import { TimelineCard } from './share-dashboard-timeline-card'
import { DashboardHeader, FilterSummaryBanner } from './share-dashboard-header'
import { KpiGrid } from './share-dashboard-kpis'
import { CountryBreakdownCard, DevicesBreakdownCard, ReferrerBreakdownCard } from './share-dashboard-breakdown'
import { TopNotesCard } from './share-dashboard-top-notes'
import { StaleLinksCard } from './share-dashboard-stale-card'
import { RecentActivityCard } from './share-dashboard-activity'
import { useShareDashboardView } from './use-share-dashboard-view'

/**
 * The share dashboard: one request's worth of analytics, drawn as the header's controls, the KPI
 * row, the timeline, the breakdown cards and the recent-activity list. The shell only decides which
 * of the three states (failed / first load / data) is on screen — each card owns its own rendering.
 */
export function ShareDashboardView({
  onSelectNoteAnalytics,
  onOpenLogs,
  onOpenChannelLogs,
}: {
  onSelectNoteAnalytics?: (noteId: string) => void
  onOpenLogs?: () => void
  onOpenChannelLogs?: (channel: string) => void
}) {
  const bundle = useShareDashboardView()
  const { analytics, error, isLoading, loadData, range, totalFilteredCount, locale } = bundle
  return (
    <div className='flex h-full flex-col overflow-y-auto bg-[var(--bg-base)] p-5'>
      <DashboardHeader bundle={bundle} />
      {error ? (
        <LoadErrorState label={t('share.analytics_load_failed')} onRetry={() => void loadData(range)} />
      ) : isLoading && !analytics ? (
        <ShareDashboardLoading />
      ) : (
        <>
          {totalFilteredCount > 0 && <FilterSummaryBanner bundle={bundle} />}
          <KpiGrid analytics={analytics} />
          <TimelineCard bundle={bundle} />
          <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2'>
            <TopNotesCard analytics={analytics} onSelectNoteAnalytics={onSelectNoteAnalytics} />
            <CountryBreakdownCard analytics={analytics} locale={locale} />
            <ReferrerBreakdownCard analytics={analytics} onOpenChannelLogs={onOpenChannelLogs} />
            <DevicesBreakdownCard analytics={analytics} />
          </div>
          <StaleLinksCard bundle={bundle} />
          <RecentActivityCard analytics={analytics} onOpenLogs={onOpenLogs} locale={locale} />
        </>
      )}
    </div>
  )
}
