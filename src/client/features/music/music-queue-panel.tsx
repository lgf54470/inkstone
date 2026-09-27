import { useRef } from 'react'
import { ListMusic, Trash2, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { confirmClearQueue } from './music-queue-clear'
import { MusicQueueBrowser } from './music-queue-browser'

// REF-11: the panel used to cover the last rows of the list at a fixed 288px, so the
// list and the queue could never both be readable at once. The height belongs to the
// reader now, and the list steps aside for whatever they choose.
export const QUEUE_PANEL_DEFAULT_HEIGHT = 288
const QUEUE_PANEL_MIN_HEIGHT = 144
const QUEUE_PANEL_MAX_HEIGHT = 640
const QUEUE_RESIZE_STEP_PX = 32

export function clampQueueHeight(height: number): number {
  return Math.min(QUEUE_PANEL_MAX_HEIGHT, Math.max(QUEUE_PANEL_MIN_HEIGHT, Math.round(height)))
}

export function MusicQueuePanel({ open, onClose, height, onResize }: {
  open: boolean
  onClose: () => void
  height: number
  onResize: (height: number) => void
}) {
  const queueLength = useMusic((state) => state.queue.length)
  const clearQueue = useMusic((state) => state.clearQueue)
  if (!open) return null
  return (
    <div
      className='absolute inset-x-0 bottom-0 z-[var(--z-popover)] flex flex-col overflow-hidden rounded-t-[var(--r-lg)] border-t border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-pop)]'
      style={{ height }}
    >
      <QueueResizeHandle height={height} onResize={onResize} />
      <div className='flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3'>
        <span className='flex items-center gap-1.5 text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          <ListMusic size={13} />
          {t('music.queue_count', { value0: queueLength })}
        </span>
        <div className='flex items-center gap-0.5'>
          <IconButton label={t('music.clear_queue')} size='sm' onClick={() => void confirmClearQueue(queueLength, clearQueue)}><Trash2 size={13} /></IconButton>
          <IconButton label={t('common.close')} size='sm' onClick={onClose}><X size={14} /></IconButton>
        </div>
      </div>
      <MusicQueueBrowser className='flex min-h-0 flex-1 flex-col p-1.5' />
    </div>
  )
}

// A drag handle that is also a keyboard control: the separator role carries the value,
// and the arrow keys move it for anyone not holding a pointer.
function QueueResizeHandle({ height, onResize }: { height: number; onResize: (height: number) => void }) {
  const dragRef = useRef<{ pointerY: number; height: number } | null>(null)
  return (
    <div
      role='separator'
      aria-orientation='horizontal'
      aria-label={t('music.queue_resize')}
      aria-valuenow={height}
      aria-valuemin={QUEUE_PANEL_MIN_HEIGHT}
      aria-valuemax={QUEUE_PANEL_MAX_HEIGHT}
      tabIndex={0}
      className='group flex h-2.5 shrink-0 cursor-row-resize items-center justify-center'
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { pointerY: event.clientY, height }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return
        onResize(clampQueueHeight(drag.height + (drag.pointerY - event.clientY)))
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowUp' ? QUEUE_RESIZE_STEP_PX : event.key === 'ArrowDown' ? -QUEUE_RESIZE_STEP_PX : 0
        if (step === 0) return
        event.preventDefault()
        onResize(clampQueueHeight(height + step))
      }}
    >
      <span aria-hidden='true' className='h-0.5 w-10 rounded-[var(--r-full)] bg-[var(--border-default)]' />
    </div>
  )
}
