import { useId } from 'react'
import { BigSvgChart, chartSummary } from '../../components/big-svg-chart'
import { Segmented } from '../../components/form'
import { formatNumber } from '../../lib/time'
import { t } from '../../lib/i18n'
import type { useShareDashboardView } from './use-share-dashboard-view'

type DashboardBundle = ReturnType<typeof useShareDashboardView>

export function TimelineCard({ bundle }: { bundle: DashboardBundle }) {
  const { metricMode, setMetricMode, timelinePoints, chartValues } = bundle
  const titleId = useId()
  const summary = chartSummary(chartValues, timelinePoints.map((point) => point.label))
  return (
    <div className='mt-4 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-soft)]'>
      <div className='flex flex-wrap items-center justify-between gap-2 pb-3'>
        <div>
          <h3 id={titleId} className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {t('share.timeline_trend_title')}
          </h3>
          <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
            {metricMode === 'views' ? t('share.timeline_pv_desc') : t('share.timeline_uv_desc')}
          </p>
        </div>

        <Segmented
          aria-labelledby={titleId}
          options={[
            { value: 'views', label: t('share.metric_pv') },
            { value: 'visitors', label: t('share.metric_uv') },
          ]}
          value={metricMode}
          onChange={(val) => setMetricMode(val as 'views' | 'visitors')}
        />
      </div>

      <div className='h-60 w-full pt-2'>
        <BigSvgChart
          values={chartValues}
          timeline={timelinePoints}
          emptyLabel={t('share.no_data_yet')}
          ariaLabel={t('share.timeline_chart_aria', {
            total: formatNumber(summary.total),
            peak: formatNumber(summary.peak),
            at: summary.peakLabel,
          })}
        />
      </div>
    </div>
  )
}
