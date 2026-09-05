import { useEffect, useState } from 'react'
import { TopPostsCard } from './top-posts-card'
import { AudienceCards } from './audience-cards'
import { VisitLogsCard } from './visit-logs-card'
import { PendingCommentsCard } from './pending-comments-card'
import { Activity, ExternalLink, FileText, MousePointerClick, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import type {
  BlogGlobalAnalytics,
  ShareTimelineRange,
} from '@shared/types'
import { BigSvgChart } from '../../../components/big-svg-chart'
import { KpiCard } from '../../../components/dashboard-blocks'
import { Button, IconButton } from '../../../components/primitives'
import { Segmented } from '../../../components/form'
import { t, useLocale } from '../../../lib/i18n'
import { api } from '../../../lib/api'
import { useBlogStore, type BlogTab } from '../blog-store'

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
        <TopPostsCard posts={analytics?.topPosts ?? []} frontendBase={frontendBase} />

        {/* Visitor Geography */}
        <AudienceCards analytics={analytics} locale={locale} />
      </div>

      {/* Lower Section: Realtime Logs & Pending Comments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Real-time Visit Logs */}
        <VisitLogsCard analytics={analytics} locale={locale} />

        {/* Pending Comments & Moderation */}
        <PendingCommentsCard pendingComments={pendingComments} totalComments={comments.length} totalPosts={posts.length} onSwitchTab={onSwitchTab} updateCommentStatus={updateCommentStatus} />
      </div>
    </div>
  )
}

