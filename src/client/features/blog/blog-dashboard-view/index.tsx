import { Activity, ExternalLink, FileText, MousePointerClick, Users } from 'lucide-react'
import type { BlogGlobalAnalytics, BlogStats } from '@shared/types'
import { KpiCard } from '../../../components/dashboard-blocks'
import { Button } from '../../../components/primitives'
import { t } from '../../../lib/i18n'
import { formatNumber } from '../../../lib/time'
import type { BlogTab } from '../blog-store'
import { useBlogDashboardView } from './use-blog-dashboard-view'
import { DashboardControls } from './dashboard-controls'
import { TrendChartCard } from './trend-chart-card'
import { TopPostsCard } from './top-posts-card'
import { AudienceCards } from './audience-cards'
import { VisitLogsCard } from './visit-logs-card'
import { PendingCommentsCard } from './pending-comments-card'
import { BlogLoadFailure } from '../blog-load-failure'

export function BlogDashboardView({
  onSwitchTab,
  onOpenNewPost,
}: {
  onSwitchTab: (tab: BlogTab) => void
  onOpenNewPost: () => void
}) {
  const view = useBlogDashboardView()

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-base)] p-5 space-y-5 text-[length:var(--text-12\.5)]">
      <DashboardWelcomeBanner
        siteName={view.settings?.siteName}
        subtitle={view.settings?.subtitle}
        frontendBase={view.frontendBase}
        onOpenNewPost={onOpenNewPost}
      />

      <DashboardControls
        range={view.range}
        onRangeChange={view.setRange}
        excludeBots={view.excludeBots}
        onToggleBots={() => view.setExcludeBots(!view.excludeBots)}
        loading={view.loading}
        onRefresh={() => void view.handleRefresh()}
      />

      {view.filteredBots + view.filteredVisitorTraffic.self + view.filteredVisitorTraffic.owner > 0 && (
        <BotsFilterBanner
          bots={view.filteredVisitorTraffic.bots}
          self={view.filteredVisitorTraffic.self}
          owner={view.filteredVisitorTraffic.owner}
        />
      )}

      {view.statsFailed ? (
        <BlogLoadFailure onRetry={() => void view.loadHubData({ force: true })} />
      ) : (
        <DashboardKpis stats={view.stats} analytics={view.analytics} />
      )}

      <DashboardAnalytics view={view} onSwitchTab={onSwitchTab} />
    </div>
  )
}

function DashboardAnalytics({
  view,
  onSwitchTab,
}: {
  view: ReturnType<typeof useBlogDashboardView>
  onSwitchTab: (tab: BlogTab) => void
}) {
  if (view.analyticsFailed) return <BlogLoadFailure onRetry={() => void view.handleRefresh()} />
  return (
    <>
      <TrendChartCard
        metricMode={view.metricMode}
        onMetricModeChange={view.setMetricMode}
        chartValues={view.chartValues}
        timeline={view.timelinePoints}
      />

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <TopPostsCard posts={view.analytics?.topPosts ?? []} frontendBase={view.frontendBase} />
        <AudienceCards analytics={view.analytics} locale={view.locale} />
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <VisitLogsCard analytics={view.analytics} locale={view.locale} />
        <PendingCommentsCard pendingComments={view.pendingComments} totalComments={view.comments.length} totalPosts={view.stats?.totalPosts ?? 0} onSwitchTab={onSwitchTab} updateCommentStatus={view.updateCommentStatus} />
      </div>
    </>
  )
}

function DashboardWelcomeBanner({
  siteName,
  subtitle,
  frontendBase,
  onOpenNewPost,
}: {
  siteName?: string
  subtitle?: string
  frontendBase: string
  onOpenNewPost: () => void
}) {
  return (
    <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-sunken)] p-5 shadow-[var(--shadow-soft)]'>
      <div>
        <h2 className='text-[length:var(--text-18)] font-bold text-[var(--text-primary)]'>
          {siteName || t('blog.hub_title')}
        </h2>
        <p className="mt-1 text-[length:var(--text-12\.5)] text-[var(--text-tertiary)]">
          {subtitle || t('blog.default_subtitle')}
        </p>
      </div>

      <div className='flex flex-wrap items-center gap-2.5'>
        <a
          href={frontendBase}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors'
        >
          <ExternalLink size={13} />
          <span>{t('blog.visit_frontend')}</span>
        </a>
        <Button variant='primary' size='sm' onClick={onOpenNewPost}>
          {t('blog.new_post')}
        </Button>
      </div>
    </div>
  )
}

/**
 * What the switches are actually hiding, counted by the same query that hides it. The self-referral
 * and author counts used to be the literals `0` while the server returned real ones, so the banner
 * described a filter that was not running.
 */
function BotsFilterBanner({ bots, self, owner }: { bots: number; self: number; owner: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)] shadow-[var(--shadow-soft)]">
      <div className='flex items-center gap-2'>
        <span className='flex h-2 w-2 rounded-full bg-[var(--success)]' />
        <span>
          {t('blog.filter_stats_summary', {
            bots,
            self,
            owner,
          })}
        </span>
      </div>
      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        {t('blog.real_visitors_active')}
      </span>
    </div>
  )
}

/**
 * The range's numbers, and the cumulative counter named as what it is. A card used to answer with
 * whichever of the two was larger (`analytics.totalViews ?? stats.totalViews`), so a week with no
 * visits displayed the blog's whole history next to a real PV of 0, and both were labelled the same
 * way. An unloaded payload says "not collected" rather than 0.
 */
function DashboardKpis({ stats, analytics }: { stats: BlogStats | null; analytics: BlogGlobalAnalytics | null }) {
  const notCollected = analytics ? undefined : t('blog.not_collected')
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <KpiCard
        icon={<MousePointerClick size={16} className='text-[var(--accent)]' />}
        label={t('blog.total_views_pv')}
        value={analytics?.totalViews ?? 0}
        unavailable={notCollected}
        hint={analytics ? t('blog.stored_views_hint', { count: formatNumber(analytics.storedViews) }) : undefined}
        delta={analytics?.viewsDelta}
        deltaHint={t('blog.delta_vs_previous')}
        sparkline={analytics?.sparklineViews}
      />

      <KpiCard
        icon={<Users size={16} className='text-[var(--success)]' />}
        label={t('blog.total_visitors_uv')}
        value={analytics?.totalVisitors ?? 0}
        unavailable={notCollected}
        delta={analytics?.visitorsDelta}
        deltaHint={t('blog.delta_vs_previous')}
        sparkline={analytics?.sparklineVisitors}
      />

      <PublishedPostsCard
        published={stats?.publishedPosts ?? analytics?.publishedPosts ?? 0}
        total={stats?.totalPosts ?? analytics?.totalPosts ?? 0}
      />

      <KpiCard
        icon={<Activity size={16} className='text-[var(--warning)]' />}
        label={t('blog.views_per_day')}
        value={analytics?.viewsPerDay ?? 0}
        unavailable={notCollected}
        sparkline={analytics?.sparklineViews}
      />
    </div>
  )
}

function PublishedPostsCard({ published, total }: { published: number; total: number }) {
  return (
    <div className='flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between text-[var(--text-tertiary)]'>
        <span className='text-[length:var(--text-12)] font-medium'>{t('blog.active_posts_count')}</span>
        <FileText size={16} className='text-[var(--accent)]' />
      </div>
      <div className='pt-2'>
        <div className='text-[length:var(--text-24)] font-bold tracking-tight text-[var(--text-primary)] font-mono'>
          {published}
          <span className='ml-1.5 text-[length:var(--text-12)] font-normal text-[var(--text-tertiary)] font-sans'>
            / {total} {t('blog.posts_unit')}
          </span>
        </div>
        <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)] pt-1'>
          {t('blog.active_posts_hint')}
        </p>
      </div>
    </div>
  )
}
