import { AlertCircle } from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'

// FB-U6: a listing that failed is not an empty account. Every sub-panel that loads a list says which
// of the two it is, in place, with the one action that can change it — the same shape everywhere so
// the reader learns it once. `role='status'` because the failure usually arrives after the panel is
// already on screen and has no other announcement.
export function PanelFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role='status' className='flex flex-col items-center gap-[var(--sp-2)] py-[var(--sp-6)] text-center'>
      <p className='flex items-center gap-[var(--sp-1-5)] text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        <AlertCircle size={13} className='shrink-0' aria-hidden='true' />
        {message}
      </p>
      <Button size='sm' onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  )
}
