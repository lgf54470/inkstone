import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'

/**
 * The failed state of a load. One component for the surfaces that used to paint a failed request as
 * an empty list — the reader gets the same sentence and the same retry wherever it happens.
 */
export function BlogLoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div role='status' className='flex h-[var(--empty-h-lg)] flex-col items-center justify-center gap-[var(--sp-3)] text-[var(--text-quaternary)]'>
      <AlertTriangle size={32} className='opacity-40' />
      <p>{t('blog.load_failed')}</p>
      <Button size='sm' onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
