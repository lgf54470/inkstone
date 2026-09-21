import { useId } from 'react'
import type { BlogGlobalAnalytics } from '@shared/types'
import { BigSvgChart, chartSummary } from '../../../components/big-svg-chart'
import { Segmented } from '../../../components/form'
import { formatNumber } from '../../../lib/time'
import { t } from '../../../lib/i18n'

export function TrendChartCard({
  metricMode,
  onMetricModeChange,
  chartValues,
  timeline,
}: {
  metricMode: 'views' | 'visitors'
  onMetricModeChange: (mode: 'views' | 'visitors') => void
  chartValues: number[]
  timeline: NonNullable<BlogGlobalAnalytics['timeline']>
}) {
  const titleId = useId()
  const summary = chartSummary(chartValues, timeline.map((point) => point.label))
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex flex-wrap items-center justify-between gap-2 pb-3'>
        <div>
          <h3 id={titleId} className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {t('blog.timeline_trend_title')}
          </h3>
          <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {metricMode === 'views' ? t('blog.timeline_pv_desc') : t('blog.timeline_uv_desc')}
          </p>
        </div>

        <Segmented
          aria-labelledby={titleId}
          options={[
            { value: 'views', label: t('blog.metric_pv') },
            { value: 'visitors', label: t('blog.metric_uv') },
          ]}
          value={metricMode}
          onChange={(val) => onMetricModeChange(val as 'views' | 'visitors')}
        />
      </div>

      <div className='h-60 w-full pt-2'>
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
