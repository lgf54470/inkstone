import { RefreshCw, ShieldCheck } from 'lucide-react'
import type { ShareTimelineRange } from '@shared/types'
import { IconButton } from '../../../components/primitives'
import { Segmented } from '../../../components/form'
import { t } from '../../../lib/i18n'

export function DashboardControls({
  range,
  onRangeChange,
  excludeBots,
  onToggleBots,
  loading,
  onRefresh,
}: {
  range: ShareTimelineRange
  onRangeChange: (range: ShareTimelineRange) => void
  excludeBots: boolean
  onToggleBots: () => void
  loading: boolean
  onRefresh: () => void
}) {
  const RANGE_OPTIONS = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('blog.range_all') },
  ]
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div>
        <h3 className='text-[length:var(--text-15)] font-bold text-[var(--text-primary)]'>
          {t('blog.analytics_dashboard_title')}
        </h3>
        <p className="text-[length:var(--text-11\.5)] text-[var(--text-tertiary)]">
          {t('blog.analytics_dashboard_subtitle')}
        </p>
      </div>

      <div className='flex items-center gap-2'>
        <Segmented
          label={t('blog.range_label')}
          options={RANGE_OPTIONS}
          value={range}
          onChange={(val) => onRangeChange(val as ShareTimelineRange)}
        />

        <RealVisitorsToggle excludeBots={excludeBots} onToggleBots={onToggleBots} />

        <IconButton
          size='sm'
          label={t('common.refresh')}
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

function RealVisitorsToggle({ excludeBots, onToggleBots }: { excludeBots: boolean; onToggleBots: () => void }) {
  return (
    <button
      type='button'
      onClick={onToggleBots}
      className={`inline-flex items-center gap-1.5 rounded-[var(--r-md)] border px-2.5 py-1 text-[length:var(--text-11\\.5)] font-medium transition-colors ${
        excludeBots
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
      }`}
      title={excludeBots ? t('blog.real_visitors_active') : t('blog.real_visitors')}
    >
      <ShieldCheck size={13} />
      <span>{t('blog.real_visitors')}</span>
    </button>
  )
}
