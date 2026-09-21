import { Share2 } from 'lucide-react'
import { t } from '../../lib/i18n'

/** What both list views draw when the current filter matches no shares. */
export function ShareListEmptyState() {
  return (
    <div className='flex h-64 flex-col items-center justify-center gap-2 text-center'>
      <Share2 size={32} className='text-[var(--text-quaternary)]' />
      <p className='text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]'>
        {t('share.no_shares_found')}
      </p>
      <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {t('share.no_shares_hint')}
      </p>
    </div>
  )
}
