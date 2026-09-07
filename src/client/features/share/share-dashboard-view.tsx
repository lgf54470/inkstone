import {
    Activity,
    BarChart3,
    ChevronRight,
    Compass,
    ExternalLink,
    Globe2,
    Laptop,
    MousePointerClick,
    RefreshCw,
    Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type {
    ShareGlobalAnalytics,
    ShareTimelineRange,
} from '@shared/types'
import { BigSvgChart } from '../../components/big-svg-chart'
import { BreakdownRow, KpiCard } from '../../components/dashboard-blocks'
import { IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { relativeTime } from '../../lib/time'
import { t } from '../../lib/i18n'
import { countryFlag, countryNameLocalized } from './share-helpers'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'
import type { useShareDashboardView } from './use-share-dashboard-view'
import { useShareDashboardView as useDashboardView } from './use-share-dashboard-view'

type DashboardBundle = ReturnType<typeof useShareDashboardView>

export function ShareDashboardView({
  onSelectNoteAnalytics,
  onOpenLogs,
}: {
  onSelectNoteAnalytics?: (noteId: string) => void
  onOpenLogs?: () => void
}) {
  const bundle = useDashboardView()
  const { analytics, totalFilteredCount } = bundle
  return (
    <div className='flex h-full flex-col overflow-y-auto bg-[var(--bg-base)] p-5'>
      <DashboardHeader bundle={bundle} />
      {totalFilteredCount > 0 && <FilterSummaryBanner bundle={bundle} />}
      <KpiGrid analytics={analytics} />
      <TimelineCard bundle={bundle} />
      <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <TopNotesCard analytics={analytics} onSelectNoteAnalytics={onSelectNoteAnalytics} />
        <CountryBreakdownCard analytics={analytics} locale={bundle.locale} />
        <ReferrerBreakdownCard analytics={analytics} />
        <DevicesBreakdownCard analytics={analytics} />
      </div>
      <RecentActivityCard analytics={analytics} onOpenLogs={onOpenLogs} locale={bundle.locale} />
    </div>
  )
}

function DashboardHeader({ bundle }: { bundle: DashboardBundle }) {
  const { range, setRange, isLoading, loadData } = bundle
  const RANGE_OPTIONS = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('share.range_all') },
  ]
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
          options={RANGE_OPTIONS}
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

function FilterSummaryBanner({ bundle }: { bundle: DashboardBundle }) {
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

function KpiGrid({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <KpiCard
        icon={<MousePointerClick size={16} className='text-[var(--accent)]' />}
        label={t('share.total_views_pv')}
        value={analytics?.totalViews ?? 0}
        delta={analytics?.viewsDelta}
        sparkline={analytics?.sparklineViews}
      />

      <KpiCard
        icon={<Users size={16} className='text-[var(--success)]' />}
        label={t('share.total_visitors_uv')}
        value={analytics?.totalVisitors ?? 0}
        delta={analytics?.visitorsDelta}
        sparkline={analytics?.sparklineVisitors}
      />

      <ActiveSharesCard analytics={analytics} />

      <KpiCard
        icon={<Activity size={16} className='text-[var(--warning)]' />}
        label={t('share.views_per_day')}
        value={analytics?.viewsPerDay ?? 0}
        sparkline={analytics?.sparklineViews}
      />
    </div>
  )
}

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
        <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)] pt-1'>
          {t('share.active_shares_hint')}
        </p>
      </div>
    </div>
  )
}

function TimelineCard({ bundle }: { bundle: DashboardBundle }) {
  const { metricMode, setMetricMode, timelinePoints, chartValues } = bundle
  return (
    <div className='mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex flex-wrap items-center justify-between gap-2 pb-3'>
        <div>
          <h3 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {t('share.timeline_trend_title')}
          </h3>
          <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {metricMode === 'views' ? t('share.timeline_pv_desc') : t('share.timeline_uv_desc')}
          </p>
        </div>

        <Segmented
          options={[
            { value: 'views', label: t('share.metric_pv') },
            { value: 'visitors', label: t('share.metric_uv') },
          ]}
          value={metricMode}
          onChange={(val) => setMetricMode(val as 'views' | 'visitors')}
        />
      </div>

      <div className='h-60 w-full pt-2'>
        <BigSvgChart values={chartValues} timeline={timelinePoints} emptyLabel={t('share.no_data_yet')} />
      </div>
    </div>
  )
}

function TopNotesCard({ analytics, onSelectNoteAnalytics }: {
  analytics: ShareGlobalAnalytics | null
  onSelectNoteAnalytics?: (noteId: string) => void
}) {
  const topNotes = analytics?.topNotes ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<BarChart3 size={15} className='text-[var(--accent)]' />} title={t('share.top_notes_title')} badge='TOP 10' />
      <div className='divide-y divide-[var(--border-subtle)] pt-1'>
        {topNotes.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topNotes.map((note, index) => (
            <TopNoteRow key={note.noteId} note={note} index={index} maxVal={topNotes[0]?.views || 1} onSelect={onSelectNoteAnalytics} />
          ))
        )}
      </div>
    </div>
  )
}

function TopNoteRow({ note, index, maxVal, onSelect }: {
  note: ShareGlobalAnalytics['topNotes'][number]
  index: number
  maxVal: number
  onSelect?: (noteId: string) => void
}) {
  const pct = Math.round((note.views / maxVal) * 100)
  return (
    <div
      className='flex items-center gap-3 py-2.5 hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors'
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[length:var(--text-10)] font-bold ${
          index < 3
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--bg-base)] text-[var(--text-tertiary)]'
        }`}
      >
        {index + 1}
      </span>

      <div className='flex-1 min-w-0'>
        <div className='flex items-center justify-between text-[length:var(--text-12)]'>
          <span className='truncate font-medium text-[var(--text-primary)]'>
            {note.noteTitle}
          </span>
          <span className='font-mono font-semibold text-[var(--text-primary)] ml-2'>
            {note.views} <span className='text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]'>{'PV'}</span>
          </span>
        </div>
        <div className='mt-1 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden'>
          <div
            className='h-full rounded-full bg-[var(--accent)] transition-all'
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {onSelect && (
        <button
          type='button'
          onClick={() => onSelect(note.noteId)}
          className='rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]'
          title={t('share.view_note_analytics')}
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

function CountryBreakdownCard({ analytics, locale }: {
  analytics: ShareGlobalAnalytics | null
  locale: string
}) {
  const topCountries = analytics?.topCountries ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Globe2 size={15} className='text-[var(--accent)]' />} title={t('share.top_countries_title')} badge={t('share.visitor_geography')} />
      <div className='space-y-2.5 pt-3'>
        {topCountries.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topCountries.map((item) => (
            <BreakdownRow
              key={item.name}
              name={countryNameLocalized(item.name, locale)}
              flag={countryFlag(item.name)}
              count={item.count}
              percentage={item.percentage ?? 0}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ReferrerBreakdownCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  const topReferrers = analytics?.topReferrers ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Compass size={15} className='text-[var(--accent)]' />} title={t('share.top_referrers_title')} badge={t('share.traffic_sources')} />
      <div className='space-y-2.5 pt-3'>
        {topReferrers.length === 0 ? (
          <EmptyRow label={t('share.no_data_yet')} />
        ) : (
          topReferrers.map((item) => (
            <BreakdownRow
              key={item.name}
              name={item.name}
              count={item.count}
              percentage={item.percentage ?? 0}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DevicesBreakdownCard({ analytics }: { analytics: ShareGlobalAnalytics | null }) {
  const devices = analytics?.devices ?? []
  const osList = analytics?.osList ?? []
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <CardHeader icon={<Laptop size={15} className='text-[var(--accent)]' />} title={t('share.devices_and_systems')} badge={t('share.client_environment')} />
      <div className='space-y-3 pt-3'>
        <p className='text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider'>
          {t('share.device_type')}
        </p>
        <div className='space-y-2'>
          {devices.map((d) => (
            <BreakdownRow
              key={d.name}
              name={localizeDeviceName(d.name)}
              count={d.count}
              percentage={d.percentage ?? 0}
            />
          ))}
        </div>

        <p className='pt-2 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider'>
          {t('share.operating_system')}
        </p>
        <div className='space-y-2'>
          {osList.slice(0, 5).map((os) => (
            <BreakdownRow
              key={os.name}
              name={os.name}
              count={os.count}
              percentage={os.percentage ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function localizeDeviceName(name: string): string {
  if (name === 'desktop') return t('share.device_desktop')
  if (name === 'mobile') return t('share.device_mobile')
  if (name === 'tablet') return t('share.device_tablet')
  return name
}

function RecentActivityCard({ analytics, onOpenLogs, locale }: {
  analytics: ShareGlobalAnalytics | null
  onOpenLogs?: () => void
  locale: string
}) {
  const recentVisits = analytics?.recentVisits ?? []
  return (
    <div className='mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between pb-3'>
        <div className='flex items-center gap-2'>
          <h3 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5'>
            <Activity size={15} className='text-[var(--accent)]' />
            {t('share.recent_activity_title')}
          </h3>
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            {t('share.realtime_stream')}
          </span>
        </div>
        {onOpenLogs && (
          <button
            type='button'
            onClick={onOpenLogs}
            className='flex items-center gap-1 text-[length:var(--text-11)] font-medium text-[var(--accent)] hover:underline'
          >
            <span>{t('share.view_all_logs')}</span>
            <ExternalLink size={12} />
          </button>
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
          {visit.noteTitle || 'Untitled note'}
        </span>
        <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          ({countryNameLocalized(visit.country, locale)}
          {visit.city ? ` · ${visit.city}` : ''})
        </span>
        <VisitBadges visit={visit} />
      </div>

      <div className='flex items-center gap-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        <span className='rounded bg-[var(--bg-base)] px-1.5 py-0.5 font-mono'>
          {visit.browser || 'Other'} / {visit.os || 'other'}
        </span>
        {visit.referrerHost && (
          <span className='truncate max-w-[120px]'>{visit.referrerHost}</span>
        )}
        <span className='font-mono'>{relativeTime(visit.visitedAt)}</span>
      </div>
    </div>
  )
}

function VisitBadges({ visit }: {
  visit: ShareGlobalAnalytics['recentVisits'][number]
}) {
  return (
    <>
      {visit.isBot && (
        <span className='rounded bg-[var(--danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--danger)]'>
          🤖 {visit.botName || t('share.badge_bot')}
        </span>
      )}
      {visit.isOwner && (
        <span className='rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--accent)]'>
          👤 {t('share.badge_owner')}
        </span>
      )}
      {visit.isSelfReferrer && (
        <span className='rounded bg-[var(--warning-subtle)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--warning)]'>
          {t('share.badge_self_referrer')}
        </span>
      )}
    </>
  )
}

function CardHeader({ icon, title, badge }: {
  icon: ReactNode
  title: string
  badge: string
}) {
  return (
    <div className='flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]'>
      <h3 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5'>
        {icon}
        {title}
      </h3>
      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {badge}
      </span>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{label}</p>
}