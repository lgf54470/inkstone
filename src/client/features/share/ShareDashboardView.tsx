import { useEffect, useState } from 'react'
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
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import type {
  ShareGlobalAnalytics,
  ShareTimelinePoint,
  ShareTimelineRange,
} from '@shared/types'
import { IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { relativeTime } from '../../lib/time'
import { t, useLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { countryFlag, countryNameLocalized } from './share-helpers'
import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './ShareTrafficFilterPopover'

export function ShareDashboardView({
  onSelectNoteAnalytics,
  onOpenLogs,
}: {
  onSelectNoteAnalytics?: (noteId: string) => void
  onOpenLogs?: () => void
}) {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [analytics, setAnalytics] = useState<ShareGlobalAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const loadData = async (selectedRange = range) => {
    setIsLoading(true)
    try {
      const data = await api.share.globalAnalytics(selectedRange, {
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      setAnalytics(data)
    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData(range)
  }, [range, excludeBots, excludeSelfReferrers, excludeOwner])

  const RANGE_OPTIONS = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('share.range_all') },
  ]

  const timelinePoints = analytics?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))

  const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0
  const filteredSelf = excludeSelfReferrers ? (analytics?.filterStats?.selfReferrals ?? 0) : 0
  const filteredOwner = excludeOwner ? (analytics?.filterStats?.owner ?? 0) : 0
  const totalFilteredCount = filteredBots + filteredSelf + filteredOwner

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--bg-base)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
            {t('share.analytics_dashboard_title')}
          </h2>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            {t('share.analytics_dashboard_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={(val) => setRange(val as ShareTimelineRange)}
          />

          <ShareTrafficFilterPopover />

          <IconButton
            size="sm"
            label={t('common.refresh')}
            disabled={isLoading}
            onClick={() => void loadData(range)}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {totalFilteredCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-[var(--success)]" />
            <span>
              {t('share.filter_stats_summary', {
                bots: filteredBots,
                self: filteredSelf,
                owner: filteredOwner,
              })}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-quaternary)]">
            {t('share.filter_real_traffic_active')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<MousePointerClick size={16} className="text-[var(--accent)]" />}
          label={t('share.total_views_pv')}
          value={analytics?.totalViews ?? 0}
          delta={analytics?.viewsDelta}
          sparkline={analytics?.sparklineViews}
        />

        <KpiCard
          icon={<Users size={16} className="text-[var(--success)]" />}
          label={t('share.total_visitors_uv')}
          value={analytics?.totalVisitors ?? 0}
          delta={analytics?.visitorsDelta}
          sparkline={analytics?.sparklineVisitors}
        />

        <div className="flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between text-[var(--text-tertiary)]">
            <span className="text-[12px] font-medium">{t('share.active_shares_count')}</span>
            <Globe2 size={16} className="text-[var(--accent)]" />
          </div>
          <div className="pt-2">
            <div className="text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
              {analytics?.activeShares ?? 0}
              <span className="ml-1.5 text-[12px] font-normal text-[var(--text-tertiary)]">
                / {analytics?.totalShares ?? 0} {t('share.shares_unit')}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-quaternary)] pt-1">
              {t('share.active_shares_hint')}
            </p>
          </div>
        </div>

        <KpiCard
          icon={<Activity size={16} className="text-[var(--warning)]" />}
          label={t('share.views_per_day')}
          value={analytics?.viewsPerDay ?? 0}
          sparkline={analytics?.sparklineViews}
        />
      </div>

      <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t('share.timeline_trend_title')}
            </h3>
            <p className="text-[11px] text-[var(--text-tertiary)]">
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

        <div className="h-60 w-full pt-2">
          <BigSvgChart values={chartValues} timeline={timelinePoints} range={range} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <BarChart3 size={15} className="text-[var(--accent)]" />
              {t('share.top_notes_title')}
            </h3>
            <span className="text-[11px] text-[var(--text-quaternary)]">{'TOP 10'}</span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] pt-1">
            {!analytics?.topNotes || analytics.topNotes.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--text-quaternary)]">
                {t('share.no_data_yet')}
              </p>
            ) : (
              analytics.topNotes.map((note, index) => {
                const maxVal = analytics.topNotes[0]?.views || 1
                const pct = Math.round((note.views / maxVal) * 100)
                return (
                  <div
                    key={note.noteId}
                    className="flex items-center gap-3 py-2.5 hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        index < 3
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-base)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {note.noteTitle}
                        </span>
                        <span className="font-mono font-semibold text-[var(--text-primary)] ml-2">
                          {note.views} <span className="text-[10px] font-normal text-[var(--text-tertiary)]">{'PV'}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {onSelectNoteAnalytics && (
                      <button
                        type="button"
                        onClick={() => onSelectNoteAnalytics(note.noteId)}
                        className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                        title={t('share.view_note_analytics')}
                      >
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Globe2 size={15} className="text-[var(--accent)]" />
              {t('share.top_countries_title')}
            </h3>
            <span className="text-[11px] text-[var(--text-quaternary)]">
              {t('share.visitor_geography')}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topCountries || analytics.topCountries.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--text-quaternary)]">
                {t('share.no_data_yet')}
              </p>
            ) : (
              analytics.topCountries.map((item) => (
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

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Compass size={15} className="text-[var(--accent)]" />
              {t('share.top_referrers_title')}
            </h3>
            <span className="text-[11px] text-[var(--text-quaternary)]">
              {t('share.traffic_sources')}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topReferrers || analytics.topReferrers.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-[var(--text-quaternary)]">
                {t('share.no_data_yet')}
              </p>
            ) : (
              analytics.topReferrers.map((item) => (
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

        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Laptop size={15} className="text-[var(--accent)]" />
              {t('share.devices_and_systems')}
            </h3>
            <span className="text-[11px] text-[var(--text-quaternary)]">
              {t('share.client_environment')}
            </span>
          </div>

          <div className="space-y-3 pt-3">
            <p className="text-[11px] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('share.device_type')}
            </p>
            <div className="space-y-2">
              {analytics?.devices.map((d) => (
                <BreakdownRow
                  key={d.name}
                  name={
                    d.name === 'desktop'
                      ? t('share.device_desktop')
                      : d.name === 'mobile'
                        ? t('share.device_mobile')
                        : d.name === 'tablet'
                          ? t('share.device_tablet')
                          : d.name
                  }
                  count={d.count}
                  percentage={d.percentage ?? 0}
                />
              ))}
            </div>

            <p className="pt-2 text-[11px] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('share.operating_system')}
            </p>
            <div className="space-y-2">
              {analytics?.osList.slice(0, 5).map((os) => (
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
      </div>

      <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Activity size={15} className="text-[var(--accent)]" />
              {t('share.recent_activity_title')}
            </h3>
            <span className="text-[11px] text-[var(--text-quaternary)]">
              {t('share.realtime_stream')}
            </span>
          </div>
          {onOpenLogs && (
            <button
              type="button"
              onClick={onOpenLogs}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline"
            >
              <span>{t('share.view_all_logs')}</span>
              <ExternalLink size={12} />
            </button>
          )}
        </div>

        <div className="divide-y divide-[var(--border-subtle)] pt-1">
          {!analytics?.recentVisits || analytics.recentVisits.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--text-quaternary)]">
              {t('share.no_visits_yet')}
            </p>
          ) : (
            analytics.recentVisits.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
              >
                <div className="flex items-center gap-2">
                  <span>{countryFlag(v.country)}</span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {v.noteTitle || 'Untitled note'}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    ({countryNameLocalized(v.country, locale)}
                    {v.city ? ` · ${v.city}` : ''})
                  </span>
                  {v.isBot && (
                    <span className="rounded bg-[var(--danger-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
                      🤖 {v.botName || t('share.badge_bot')}
                    </span>
                  )}
                  {v.isOwner && (
                    <span className="rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      👤 {t('share.badge_owner')}
                    </span>
                  )}
                  {v.isSelfReferrer && (
                    <span className="rounded bg-[var(--warning-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
                      {t('share.badge_self_referrer')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-[var(--text-quaternary)]">
                  <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 font-mono">
                    {v.browser || 'Other'} / {v.os || 'other'}
                  </span>
                  {v.referrerHost && (
                    <span className="truncate max-w-[120px]">{v.referrerHost}</span>
                  )}
                  <span className="font-mono">{relativeTime(v.visitedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  delta,
  sparkline,
}: {
  icon: React.ReactNode
  label: string
  value: number
  delta?: number
  sparkline?: number[]
}) {
  return (
    <div className="flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between text-[var(--text-tertiary)]">
        <span className="text-[12px] font-medium">{label}</span>
        {icon}
      </div>

      <div className="flex items-baseline justify-between pt-2">
        <span className="text-[24px] font-bold tracking-tight text-[var(--text-primary)] font-mono">
          {value.toLocaleString()}
        </span>

        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
              delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }`}
          >
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta > 0 ? `+${delta}%` : `${delta}%`}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <div className="mt-2 h-7 w-full">
          <MiniSparkline values={sparkline} />
        </div>
      )}
    </div>
  )
}

function BreakdownRow({
  name,
  flag,
  count,
  percentage,
}: {
  name: string
  flag?: string
  count: number
  percentage: number
}) {
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 truncate text-[var(--text-primary)]">
          {flag && <span className="text-[13px]">{flag}</span>}
          <span className="truncate">{name}</span>
        </span>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="font-semibold text-[var(--text-primary)]">{count}</span>
          <span className="w-8 text-right text-[var(--text-tertiary)]">{percentage}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const min = 0
  const width = 100
  const height = 28
  const step = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / (max - min)) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const linePath = `M${points.join(' L')}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BigSvgChart({
  values,
  timeline,
  range: _range,
}: {
  values: number[]
  timeline: ShareTimelinePoint[]
  range?: ShareTimelineRange
}) {
  if (values.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-quaternary)]">
        {t('share.no_data_yet')}
      </div>
    )
  }

  const W = 800
  const H = 220
  const PAD = { l: 36, r: 12, t: 10, b: 24 }

  const maxVal = Math.max(...values, 1)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0

  const pts: Array<[number, number]> = values.map((val, i) => {
    const x = values.length > 1 ? PAD.l + i * stepX : PAD.l + innerW / 2
    const y = PAD.t + innerH - (val / maxVal) * innerH
    return [x, y]
  })

  const solidLine = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ')

  const baseY = PAD.t + innerH
  const area =
    pts.length > 1
      ? `${solidLine} L${pts[pts.length - 1][0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`
      : ''

  const gridSteps = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="bigChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {gridSteps.map((g, gi) => {
        const gy = PAD.t + innerH * (1 - g)
        const val = Math.round(maxVal * g)
        return (
          <g key={gi}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={gy}
              y2={gy}
              stroke="var(--border-subtle)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <text
              x={PAD.l - 6}
              y={gy + 3}
              fontSize="9"
              fill="var(--text-tertiary)"
              textAnchor="end"
              fontFamily="var(--font-family-mono, monospace)"
            >
              {val}
            </text>
          </g>
        )
      })}

      {area && <path d={area} fill="url(#bigChartGrad)" />}

      <path
        d={solidLine}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {pts.map((p, i) => {
        const item = timeline[i]
        return (
          <circle
            key={i}
            cx={p[0].toFixed(1)}
            cy={p[1].toFixed(1)}
            r="3"
            fill="var(--bg-card)"
            stroke="var(--accent)"
            strokeWidth="2"
          >
            <title>{`${item?.label}: ${values[i]}`}</title>
          </circle>
        )
      })}

      {pts.map((p, i) => {
        const interval = values.length > 20 ? 4 : values.length > 10 ? 2 : 1
        if (i % interval !== 0 && i !== values.length - 1) return null
        const item = timeline[i]
        return (
          <text
            key={`lbl-${i}`}
            x={p[0].toFixed(1)}
            y={H - 6}
            fontSize="9"
            fill="var(--text-tertiary)"
            textAnchor="middle"
            fontFamily="var(--font-family-mono, monospace)"
          >
            {item?.label || ''}
          </text>
        )
      })}
    </svg>
  )
}
