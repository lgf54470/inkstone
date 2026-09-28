import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicQueueBrowser } from './music-queue-browser'
import { MusicQueueList } from './music-queue-list'

// FB2-U1: the queue's fold is one state for the whole surface, because two shapes host the queue —
// the artwork column on a wide window and the strip under the lyrics when the columns stack. It
// lives beside the components that spend it rather than in the player that threads it through.
export function useQueueFold(): { queueOpen: boolean; onToggleQueue: () => void } {
  const [queueOpen, setQueueOpen] = useState(false)
  return { queueOpen, onToggleQueue: () => setQueueOpen((value) => !value) }
}

// FB2-U1: the queue the hub and the floating player both answer with a search box now lives in this
// surface's artwork column as well: under the transport there was half a column of nothing while the
// queue spent a slice of the lyrics column below the words. The stack keeps the strip at the bottom.
export function ImmersiveQueuePane({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queueLength = useMusic((state) => state.queue.length)
  if (!open) return null
  return (
    <div className='flex min-h-0 w-full flex-1 flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3'>
      <div className='flex h-6 shrink-0 items-center justify-between'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>
          {t('music.queue_count', { value0: queueLength })}
        </span>
        <IconButton label={t('music.queue_toggle')} size='sm' aria-expanded onClick={onClose}>
          <ChevronDown size={13} />
        </IconButton>
      </div>
      {/* The group is the scroll region itself, so the arrow keys work from the focus stop rather
          than only once a row has been reached; the browser inside brings the search and the
          "nothing matches" state the hub and the floating player already answer with. */}
      <div role='group' tabIndex={0} aria-label={t('music.queue')} className='min-h-0 flex-1 overflow-y-auto'>
        <MusicQueueBrowser />
      </div>
    </div>
  )
}

// REF-5: the queue used to keep a permanent slice of the lyrics column, which left the
// scroller short enough that long lyrics scrolled in two places at once. Folded, it
// costs one line; the count stays readable so the queue is never a hidden state. FB2-U1: this strip
// is the stacked shape's home for the queue, where there is no second column to move it into.
export function ImmersiveQueueEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type='button'
      onClick={onOpen}
      aria-expanded={false}
      aria-label={t('music.queue_toggle')}
      className='flex h-9 shrink-0 items-center justify-center gap-1.5 border-t border-[var(--border-subtle)] text-[length:var(--text-11)] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]'
    >
      <ChevronUp size={13} />
      {t('music.queue_count', { value0: count })}
    </button>
  )
}

export function ImmersiveQueue({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className='flex max-h-40 shrink-0 flex-col border-t border-[var(--border-subtle)]'>
      <div className='flex h-8 shrink-0 items-center justify-between px-2'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>{t('music.queue')}</span>
        <IconButton label={t('music.queue_toggle')} size='sm' aria-expanded onClick={onCollapse}>
          <ChevronDown size={13} />
        </IconButton>
      </div>
      <div role='group' tabIndex={0} aria-label={t('music.queue')} className='min-h-0 flex-1 overflow-y-auto p-2'>
        <MusicQueueList />
      </div>
    </div>
  )
}
