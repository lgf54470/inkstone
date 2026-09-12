import { X } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { formatDuration } from './music-utils'
import { MusicArtwork } from './music-artwork'

interface QueueRow {
  track: MusicTrack
  index: number
}

export function MusicQueueList({
  className,
  rowClassName,
  ids,
  emptyText,
}: {
  className?: string
  rowClassName?: string
  ids?: string[]
  emptyText?: string
}) {
  const queue = useMusic((state) => state.queue)
  const tracks = useMusic((state) => state.tracks)
  const selected = ids ?? queue
  const byId = new Map(tracks.map((track) => [track.id, track]))
  const rows: QueueRow[] = selected
    .map((id) => ({ track: byId.get(id), index: queue.indexOf(id) }))
    .filter((row): row is QueueRow => Boolean(row.track))

  if (!rows.length) {
    return <p className='py-6 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{emptyText ?? t('music.queue_empty')}</p>
  }
  return (
    <div className={cn('space-y-0.5', className)}>
      {rows.map((row) => <QueueRowItem key={`${row.track.id}-${row.index}`} row={row} rowClassName={rowClassName} />)}
    </div>
  )
}

function QueueRowItem({ row, rowClassName }: { row: QueueRow; rowClassName?: string }) {
  const currentIndex = useMusic((state) => state.currentIndex)
  const isPlaying = useMusic((state) => state.isPlaying)
  const playQueueAt = useMusic((state) => state.playQueueAt)
  const removeFromQueue = useMusic((state) => state.removeFromQueue)
  const isCurrent = row.index === currentIndex
  return (
    <div className={cn('group/queue flex h-9 items-center gap-2 rounded-[var(--r-sm)] px-2', isCurrent && 'bg-[var(--accent-soft)]', rowClassName)}>
      <MusicArtwork url={row.track.coverUrl} alt='' className='size-6 rounded-[var(--r-xs)]' iconSize={10} />
      <button
        type='button'
        onClick={() => void playQueueAt(row.index)}
        className='min-w-0 flex-1 truncate text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      >
        {row.track.title}{isCurrent && isPlaying ? ' ♪' : ''}
      </button>
      <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatDuration(row.track.durationMs)}</span>
      <IconButton
        label={t('music.remove_from_queue')}
        size='sm'
        onClick={() => removeFromQueue(row.index)}
        className='opacity-0 group-hover/queue:opacity-100 group-focus-within/queue:opacity-100'
      >
        <X size={12} />
      </IconButton>
    </div>
  )
}