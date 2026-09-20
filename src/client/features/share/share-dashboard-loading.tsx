import { Skeleton } from '../../components/feedback'
import { t } from '../../lib/i18n'

const KPI_PLACEHOLDERS = ['pv', 'uv', 'shares', 'per-day']
const PANEL_PLACEHOLDERS = ['top-notes', 'countries', 'referrers', 'devices']

/**
 * First load of the dashboard. Zero-filled cards would be a claim about the data
 * ("no visits in this window") rather than a state of the request, so the KPI grid,
 * the trend and the four breakdown cards all stand in as shimmer placeholders until
 * the first answer arrives. Later range switches keep the previous cards instead.
 */
export function ShareDashboardLoading() {
  return (
    <div className='flex h-full flex-col'>
      <p
        role='status'
        aria-busy='true'
        className='pb-3 text-center text-[length:var(--text-12)] text-[var(--text-tertiary)]'
      >
        {t('common.loading')}
      </p>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {KPI_PLACEHOLDERS.map((key) => (
          <Skeleton key={key} className='h-22 rounded-[var(--r-lg)] border border-[var(--border-subtle)]' />
        ))}
      </div>

      <Skeleton className='mt-4 h-64 rounded-[var(--r-lg)] border border-[var(--border-subtle)]' />

      <div className='mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {PANEL_PLACEHOLDERS.map((key) => (
          <Skeleton key={key} className='h-48 rounded-[var(--r-lg)] border border-[var(--border-subtle)]' />
        ))}
      </div>
    </div>
  )
}
