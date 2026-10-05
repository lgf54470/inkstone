import { useRef } from 'react'
import { ListMusic, Trash2, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { confirmClearQueue } from './music-queue-clear'
import { MusicQueueBrowser } from './music-queue-browser'
import { MUSIC_QUEUE_PANEL_HEIGHT } from './music-utils'

// REF-11: the panel's height belongs to the reader; its starting value is shared with the hub,
// which has to reserve that much room before this module has been fetched at all.
export { MUSIC_QUEUE_PANEL_HEIGHT as QUEUE_PANEL_DEFAULT_HEIGHT }
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
      <div className='flex h-[var(--sp-9)] shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-[var(--sp-3)]'>
        <span className='flex items-center gap-[var(--sp-1-5)] text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          <ListMusic size={13} />
          {t('music.queue_count', { value0: queueLength })}
        </span>
        <div className='flex items-center gap-[var(--sp-0-5)]'>
          <IconButton label={t('music.clear_queue')} size='sm' onClick={() => void confirmClearQueue(queueLength, clearQueue)}><Trash2 size={13} /></IconButton>
          <IconButton label={t('common.close')} size='sm' onClick={onClose}><X size={14} /></IconButton>
        </div>
      </div>
      <MusicQueueBrowser className='flex min-h-0 flex-1 flex-col p-[var(--sp-1-5)]' />
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
      className='group flex h-[var(--sp-2-5)] shrink-0 cursor-row-resize items-center justify-center'
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
      <span aria-hidden='true' className='h-[var(--sp-0-5)] w-[var(--sp-10)] rounded-[var(--r-full)] bg-[var(--border-default)]' />
    </div>
  )
}
