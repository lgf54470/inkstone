import { BarChart2, ExternalLink, RefreshCw, Users } from 'lucide-react'
import type { BlogPostAnalytics, ShareTimelineRange } from '@shared/types'
import { BigSvgChart, chartSummary } from '../../../components/big-svg-chart'
import { KpiCard } from '../../../components/dashboard-blocks'
import { Segmented } from '../../../components/form'
import { Modal } from '../../../components/overlay'
import { IconButton } from '../../../components/primitives'
import { t, useLocale } from '../../../lib/i18n'
import { formatNumber } from '../../../lib/time'
import { BlogLoadFailure } from '../blog-load-failure'
import { AudienceCards } from './audience-cards'
import { VisitLogsCard } from './visit-logs-card'
import { useBlogPostAnalytics } from './use-blog-post-analytics'

const MODAL_WIDTH = 780

type PostAnalyticsView = ReturnType<typeof useBlogPostAnalytics>

/**
 * One post's own analytics (FEA-09), opened from the ranking card. It answers with the dashboard's
 * own cards — the same KPIs, the same chart, the same audience breakdowns and visit tail — because
 * this is the dashboard's question asked again with a narrower scope, not a second analytics surface
 * that could come to mean something else.
 */
export function PostAnalyticsModal({
  open,
  onClose,
  postId,
  frontendBase,
}: {
  open: boolean
  onClose: () => void
  postId: string | null
  frontendBase: string
}) {
  const view = useBlogPostAnalytics(open, postId)
  const data = view.data
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className='flex items-center gap-2'>
          <BarChart2 size={16} className='text-[var(--accent)]' />
          <span>{t('blog.post_analytics_title')}</span>
        </div>
      }
      description={data?.title ?? ''}
      width={MODAL_WIDTH}
    >
      <div className='flex max-h-[75vh] flex-col gap-4 overflow-y-auto py-1 pr-1'>
        <PostAnalyticsToolbar view={view} data={data} frontendBase={frontendBase} />
        {view.failed ? (
          <BlogLoadFailure onRetry={view.reload} />
        ) : view.loading && !data ? (
          <p role='status' className='py-12 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
            {t('common.loading')}
          </p>
        ) : (
          <PostAnalyticsBody view={view} data={data} />
        )}
      </div>
    </Modal>
  )
}

/** The range control, the link back to the live post and the refresh that asks again. */
function PostAnalyticsToolbar({
  view,
  data,
  frontendBase,
}: {
  view: PostAnalyticsView
  data: BlogPostAnalytics | null
  frontendBase: string
}) {
  // Built per render rather than at module scope: a module-level `t()` freezes the first locale.
  const rangeOptions = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('blog.range_all') },
  ]
  return (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <Segmented
        label={t('blog.range_label')}
        options={rangeOptions}
        value={view.range}
        onChange={(value) => view.setRange(value as ShareTimelineRange)}
      />
      <div className='flex items-center gap-2'>
        {data && (
          <a
            href={`${frontendBase}/posts/${data.slug}`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--accent)] hover:underline'
          >
            <ExternalLink size={12} />
            {t('blog.view_in_blog')}
          </a>
        )}
        <IconButton size='sm' label={t('common.refresh')} disabled={view.loading} onClick={view.reload}>
          <RefreshCw size={14} className={view.loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

function PostAnalyticsBody({ view, data }: { view: PostAnalyticsView; data: BlogPostAnalytics | null }) {
  const locale = useLocale()
  const timeline = data?.timeline ?? []
  const chartValues = timeline.map((point) => (view.metricMode === 'views' ? point.views : point.visitors))
  return (
    <>
      <PostAnalyticsKpis data={data} />
      <PostAnalyticsChart
        timeline={timeline}
        chartValues={chartValues}
        metricMode={view.metricMode}
        onMetricModeChange={view.setMetricMode}
      />
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <AudienceCards analytics={data} locale={locale} />
        <VisitLogsCard visits={data?.recentVisits ?? []} locale={locale} />
      </div>
    </>
  )
}

function PostAnalyticsKpis({ data }: { data: BlogPostAnalytics | null }) {
  const timeline = data?.timeline ?? []
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <KpiCard
        icon={<BarChart2 size={16} className='text-[var(--accent)]' />}
        label={t('blog.total_views_pv')}
        value={data?.totalViews ?? 0}
        delta={data?.viewsDelta}
        deltaHint={t('blog.delta_vs_previous')}
        sparkline={data ? timeline.map((point) => point.views) : undefined}
      />
      <KpiCard
        icon={<Users size={16} className='text-[var(--success)]' />}
        label={t('blog.total_visitors_uv')}
        value={data?.totalVisitors ?? 0}
        delta={data?.visitorsDelta}
        deltaHint={t('blog.delta_vs_previous')}
        sparkline={data ? timeline.map((point) => point.visitors) : undefined}
      />
    </div>
  )
}

function PostAnalyticsChart({
  timeline,
  chartValues,
  metricMode,
  onMetricModeChange,
}: {
  timeline: NonNullable<BlogPostAnalytics['timeline']>
  chartValues: number[]
  metricMode: 'views' | 'visitors'
  onMetricModeChange: (mode: 'views' | 'visitors') => void
}) {
  const summary = chartSummary(chartValues, timeline.map((point) => point.label))
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex flex-wrap items-center justify-between gap-2 pb-3'>
        <div>
          <h3 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {t('blog.timeline_trend_title')}
          </h3>
          <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {metricMode === 'views' ? t('blog.timeline_pv_desc') : t('blog.timeline_uv_desc')}
          </p>
        </div>
        <Segmented
          label={t('blog.timeline_trend_title')}
          options={[
            { value: 'views', label: t('blog.metric_pv') },
            { value: 'visitors', label: t('blog.metric_uv') },
          ]}
          value={metricMode}
          onChange={(value) => onMetricModeChange(value as 'views' | 'visitors')}
        />
      </div>
      <div className='h-52 w-full pt-2'>
        <BigSvgChart
          values={chartValues}
          timeline={timeline}
          emptyLabel={t('blog.no_visit_data')}
          ariaLabel={t('blog.timeline_chart_aria', {
            total: formatNumber(summary.total),
            peak: formatNumber(summary.peak),
            at: summary.peakLabel,
          })}
        />
      </div>
    </div>
  )
}
