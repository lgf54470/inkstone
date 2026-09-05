import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  ExternalLink,
  Globe2,
  Laptop,
  MousePointerClick,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Compass,
} from 'lucide-react'
import type {
  BlogGlobalAnalytics,
  ShareTimelineRange,
} from '@shared/types'
import { BigSvgChart } from '../../components/big-svg-chart'
import { Button, IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { relativeTime } from '../../lib/time'
import { t, useLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { countryFlag, countryNameLocalized } from '../share'
import { useBlogStore, type BlogTab } from './blog-store'

export function BlogDashboardView({
  onSwitchTab,
  onOpenNewPost,
}: {
  onSwitchTab: (tab: BlogTab) => void
  onOpenNewPost: () => void
}) {
  const locale = useLocale()
  const stats = useBlogStore((s) => s.stats)
  const posts = useBlogStore((s) => s.posts)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const loadAll = useBlogStore((s) => s.loadAll)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)

  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [excludeBots, setExcludeBots] = useState<boolean>(true)
  const [analytics, setAnalytics] = useState<BlogGlobalAnalytics | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const pendingComments = comments.filter((c) => c.status === 'pending')

  const loadData = async (selectedRange = range, selectedExcludeBots = excludeBots) => {
    setLoading(true)
    try {
      const res = await api.blog.analytics(selectedRange, {
        excludeBots: selectedExcludeBots,
      })
      setAnalytics(res.analytics)
    } catch (err) {
      console.error('Failed to load blog analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await Promise.all([loadData(range, excludeBots), loadAll()])
  }

  useEffect(() => {
    void loadData(range, excludeBots)
  }, [range, excludeBots])

  const RANGE_OPTIONS = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('blog.range_all') },
  ]

  const timelinePoints = analytics?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))

  const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-base)] p-5 space-y-5 text-[length:var(--text-12\.5)]">
      {/* Welcome & quick action banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-sunken)] p-5 shadow-[var(--shadow-soft)]">
        <div>
          <h2 className="text-[length:var(--text-18)] font-bold text-[var(--text-primary)]">
            {settings?.siteName || t('blog.hub_title')}
          </h2>
          <p className="mt-1 text-[length:var(--text-12\.5)] text-[var(--text-tertiary)]">
            {settings?.subtitle || t('blog.default_subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={frontendBase}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ExternalLink size={13} />
            <span>{t('blog.visit_frontend')}</span>
          </a>
          <Button variant="primary" size="sm" onClick={onOpenNewPost}>
            {t('blog.new_post')}
          </Button>
        </div>
      </div>

      {/* Control Bar: Range + Traffic Filter + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[length:var(--text-15)] font-bold text-[var(--text-primary)]">
            {t('blog.analytics_dashboard_title')}
          </h3>
          <p className="text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
            {t('blog.analytics_dashboard_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={(val) => setRange(val as ShareTimelineRange)}
          />

          <button
            type="button"
            onClick={() => setExcludeBots(!excludeBots)}
            className={`inline-flex items-center gap-1.5 rounded-[var(--r-md)] border px-2.5 py-1 text-[length:var(--text-11\.5)] font-medium transition-colors ${
              excludeBots
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
            title={excludeBots ? t('blog.real_visitors_active') : t('blog.real_visitors')}
          >
            <ShieldCheck size={13} />
            <span>{t('blog.real_visitors')}</span>
          </button>

          <IconButton
            size="sm"
            label={t('common.refresh')}
            disabled={loading}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Real traffic filter banner */}
      {excludeBots && filteredBots > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-[var(--success)]" />
            <span>
              {t('share.filter_stats_summary', {
                bots: filteredBots,
                self: 0,
                owner: 0,
              })}
            </span>
          </div>
          <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
            {t('blog.real_visitors_active')}
          </span>
        </div>
      )}

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Views (PV) */}
        <KpiCard
          icon={<MousePointerClick size={16} className="text-[var(--accent)]" />}
          label={t('blog.total_views_pv')}
          value={analytics?.totalViews ?? stats?.totalViews ?? 0}
          delta={analytics?.viewsDelta}
          sparkline={analytics?.sparklineViews}
        />

        {/* Total Visitors (UV) */}
        <KpiCard
          icon={<Users size={16} className="text-[var(--success)]" />}
          label={t('blog.total_visitors_uv')}
          value={analytics?.totalVisitors ?? 0}
          delta={analytics?.visitorsDelta}
          sparkline={analytics?.sparklineVisitors}
        />

        {/* Published Posts */}
        <div className="flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between text-[var(--text-tertiary)]">
            <span className="text-[length:var(--text-12)] font-medium">{t('blog.active_posts_count')}</span>
            <FileText size={16} className="text-[var(--accent)]" />
          </div>
          <div className="pt-2">
            <div className="text-[length:var(--text-24)] font-bold tracking-tight text-[var(--text-primary)] font-mono">
              {stats?.publishedPosts ?? analytics?.publishedPosts ?? 0}
              <span className="ml-1.5 text-[length:var(--text-12)] font-normal text-[var(--text-tertiary)] font-sans">
                / {stats?.totalPosts ?? analytics?.totalPosts ?? posts.length} {t('blog.posts_unit')}
              </span>
            </div>
            <p className="text-[length:var(--text-11)] text-[var(--text-quaternary)] pt-1">
              {t('blog.active_posts_hint')}
            </p>
          </div>
        </div>

        {/* Daily Views */}
        <KpiCard
          icon={<Activity size={16} className="text-[var(--warning)]" />}
          label={t('blog.views_per_day')}
          value={analytics?.viewsPerDay ?? 0}
          sparkline={analytics?.sparklineViews}
        />
      </div>

      {/* Main Trend Chart */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <h3 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">
              {t('blog.timeline_trend_title')}
            </h3>
            <p className="text-[length:var(--text-11)] text-[var(--text-tertiary)]">
              {metricMode === 'views' ? t('blog.timeline_pv_desc') : t('blog.timeline_uv_desc')}
            </p>
          </div>

          <Segmented
            options={[
              { value: 'views', label: t('blog.metric_pv') },
              { value: 'visitors', label: t('blog.metric_uv') },
            ]}
            value={metricMode}
            onChange={(val) => setMetricMode(val as 'views' | 'visitors')}
          />
        </div>

        <div className="h-60 w-full pt-2">
          <BigSvgChart values={chartValues} timeline={timelinePoints} emptyLabel={t('blog.no_visit_data')} />
        </div>
      </div>

      {/* 4 Audience Demographics & Breakdown Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 10 Posts */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <BarChart3 size={15} className="text-[var(--accent)]" />
              {t('blog.top_posts_title')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">{'TOP 10'}</span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] pt-1">
            {!analytics?.topPosts || analytics.topPosts.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              analytics.topPosts.map((post, index) => {
                const maxVal = analytics.topPosts[0]?.views || 1
                const pct = Math.max(2, Math.round((post.views / maxVal) * 100))
                return (
                  <div
                    key={post.postId}
                    className="flex items-center gap-3 py-2.5 hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors"
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

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[length:var(--text-12)]">
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {post.title}
                        </span>
                        <span className="font-mono font-semibold text-[var(--text-primary)] ml-2 whitespace-nowrap">
                          {post.views}{' '}
                          <span className="text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]">
                            {'PV'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <a
                      href={`${frontendBase}/posts/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-[var(--text-quaternary)] hover:text-[var(--accent)] transition-colors"
                      title={t('blog.view_in_blog')}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Visitor Geography */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Globe2 size={15} className="text-[var(--accent)]" />
              {t('blog.visitor_geography')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {analytics?.topCountries?.length ?? 0}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topCountries || analytics.topCountries.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
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

        {/* Traffic Sources */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Compass size={15} className="text-[var(--accent)]" />
              {t('blog.traffic_sources')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {analytics?.topReferrers?.length ?? 0}
            </span>
          </div>

          <div className="space-y-2.5 pt-3">
            {!analytics?.topReferrers || analytics.topReferrers.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
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

        {/* Devices and Systems */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Laptop size={15} className="text-[var(--accent)]" />
              {t('blog.devices_and_os')}
            </h3>
          </div>

          <div className="space-y-3 pt-3">
            <p className="text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('blog.device_type')}
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

            <p className="pt-2 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] uppercase tracking-wider">
              {t('blog.operating_system')}
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

      {/* Lower Section: Realtime Logs & Pending Comments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Real-time Visit Logs */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-[var(--accent)]" />
              <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
                {t('blog.realtime_logs')}
              </h3>
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]">
                {analytics?.recentVisits?.length ?? 0}
              </span>
            </div>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
              {t('blog.recent_visits_count')}
            </span>
          </div>

          <div className="flex-1 divide-y divide-[var(--border-subtle)] pt-1 overflow-y-auto max-h-[360px]">
            {!analytics?.recentVisits || analytics.recentVisits.length === 0 ? (
              <p className="py-12 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              analytics.recentVisits.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[length:var(--text-13)]">{countryFlag(v.country)}</span>
                    <span className="truncate font-medium text-[var(--text-primary)] max-w-[180px]">
                      {v.postTitle || v.slug}
                    </span>
                    <span className="text-[length:var(--text-11)] text-[var(--text-tertiary)] hidden sm:inline">
                      ({countryNameLocalized(v.country, locale)}
                      {v.city ? ` · ${v.city}` : ''})
                    </span>
                    {v.isBot && (
                      <span className="rounded bg-[var(--danger-subtle)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold text-[var(--danger)]">
                        🤖 {v.botName || 'Bot'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                    <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 font-mono">
                      {v.browser || 'Other'} / {v.os || 'other'}
                    </span>
                    {v.referrerHost && (
                      <span className="truncate max-w-[100px] hidden md:inline" title={v.referrerHost}>
                        {v.referrerHost}
                      </span>
                    )}
                    <span className="font-mono">{relativeTime(v.visitedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Comments & Moderation */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-[var(--warning)]" />
              <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
                {t('blog.pending_comments')}
              </h3>
              {pendingComments.length > 0 && (
                <span className="rounded-full bg-[var(--danger-subtle)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-bold text-[var(--danger)]">
                  {pendingComments.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('comments')}
              className="text-[length:var(--text-11)] text-[var(--accent)] hover:underline"
            >
              {t('blog.all_pending_review')} ({comments.length})
            </button>
          </div>

          <div className="flex-1 mt-3 space-y-2.5 overflow-y-auto max-h-[360px]">
            {pendingComments.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2">
                <CheckCircle size={28} className="text-[var(--success)] opacity-80" />
                <span>{t('blog.all_comments_reviewed')}</span>
                <button
                  type="button"
                  onClick={() => onSwitchTab('posts')}
                  className="mt-2 inline-flex items-center gap-1 text-[length:var(--text-11\.5)] text-[var(--accent)] hover:underline"
                >
                  <FileText size={13} />
                  <span>{t('blog.manage_posts_count')} ({posts.length})</span>
                </button>
              </div>
            ) : (
              pendingComments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{c.authorName}</span>
                      <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                        {t('blog.commented_on', { value0: c.postTitle })}
                      </span>
                    </div>
                    <span className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[length:var(--text-12)] text-[var(--text-secondary)] line-clamp-2">
                    {c.content}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'rejected')}
                      className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--danger)] hover:underline"
                    >
                      <XCircle size={12} /> {t('blog.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'approved')}
                      className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--success)] hover:underline font-medium"
                    >
                      <CheckCircle size={12} /> {t('blog.approve')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
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
    <div className="flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between text-[var(--text-tertiary)]">
        <span className="text-[length:var(--text-12)] font-medium">{label}</span>
        {icon}
      </div>

      <div className="flex items-baseline justify-between pt-2">
        <span className="text-[length:var(--text-24)] font-bold tracking-tight text-[var(--text-primary)] font-mono">
          {value.toLocaleString()}
        </span>

        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[length:var(--text-11)] font-medium ${
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
    <div className="flex flex-col gap-1 text-[length:var(--text-12)]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 truncate text-[var(--text-primary)]">
          {flag && <span className="text-[length:var(--text-13)]">{flag}</span>}
          <span className="truncate">{name}</span>
        </span>
        <div className="flex items-center gap-2 font-mono text-[length:var(--text-11)]">
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
  const step = width / Math.max(1, values.length - 1)

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
