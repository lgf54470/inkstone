import { ListMusic, Trash2, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicQueueBrowser } from './music-queue-browser'

export function MusicQueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queueLength = useMusic((state) => state.queue.length)
  const clearQueue = useMusic((state) => state.clearQueue)
  if (!open) return null
  return (
    <div className='absolute inset-x-0 bottom-0 z-[var(--z-popover)] flex max-h-72 flex-col overflow-hidden rounded-t-[var(--r-lg)] border-t border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-pop)]'>
      <div className='flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3'>
        <span className='flex items-center gap-1.5 text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          <ListMusic size={13} />
          {t('music.queue_count', { value0: queueLength })}
        </span>
        <div className='flex items-center gap-0.5'>
          <IconButton label={t('music.clear_queue')} size='sm' onClick={clearQueue}><Trash2 size={13} /></IconButton>
          <IconButton label={t('common.close')} size='sm' onClick={onClose}><X size={14} /></IconButton>
        </div>
      </div>
      <MusicQueueBrowser className='flex min-h-0 flex-1 flex-col p-1.5' />
    </div>
  )
}
