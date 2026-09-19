import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'

export function LoadErrorState({ label, onRetry }: { label: string, onRetry: () => void }) {
  return (
    <div className='flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-10 text-center shadow-[var(--shadow-soft)]'>
      <AlertTriangle size={20} className='text-[var(--warning)]' aria-hidden='true' />
      <p role='alert' className='text-[length:var(--text-13)] text-[var(--danger)]'>
        {label}
      </p>
      <Button size='sm' variant='secondary' onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
