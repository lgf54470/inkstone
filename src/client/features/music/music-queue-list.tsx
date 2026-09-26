import { memo, useCallback, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import { useMusic } from './music-store'
import { MusicArtwork } from './music-artwork'

interface QueueRow {
  track: MusicTrack
  index: number
  /** Identity, not position: a reorder or a removal must not remount a row that stayed queued. */
  rowKey: string
}

// Touch shows row actions by default; desktop reveals them on hover/focus only.
const REVEAL_ON_HOVER = 'opacity-100 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover/queue:opacity-100 md:group-hover/queue:pointer-events-auto md:group-focus-within/queue:opacity-100 md:group-focus-within/queue:pointer-events-auto'

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
  const moveQueueItem = useMusic((state) => state.moveQueueItem)
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks])
  const shown = ids ?? queue
  const rows = useMemo(() => buildQueueRows(queue, shown, byId), [queue, shown, byId])
  // Reordering only reads sensibly over the whole queue: with the browser's
  // search filtering rows, a displayed neighbour is not an adjacent queue
  // position. The browser hands back the very queue array when unfiltered.
  const reorderable = ids === undefined || ids === queue
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  // Rows are memoized, so these three must keep their identity across renders:
  // a fresh closure per row would re-render the whole list for one drag.
  const onDropRow = useCallback((from: number, to: number) => moveQueueItem(from, to), [moveQueueItem])
  const onDragEndRow = useCallback(() => setDraggedIndex(null), [])

  if (!rows.length) {
    return <p className='py-6 text-center text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{emptyText ?? t('music.queue_empty')}</p>
  }
  return (
    <div className={cn('space-y-0.5', className)}>
      {rows.map((row) => (
        <QueueRowItem
          key={row.rowKey}
          row={row}
          rowClassName={rowClassName}
          reorderable={reorderable}
          isDragSource={draggedIndex === row.index}
          onDragStartRow={setDraggedIndex}
          onDropRow={onDropRow}
          onDragEndRow={onDragEndRow}
        />
      ))}
    </div>
  )
}

// Duplicated tracks occupy several queue positions; each rendered occurrence
// takes the next free one so play/remove hit the right row. The occurrence count
// is also what keys the row: it survives the position shifts a reorder or a
// removal causes, and two rows of the same track still get distinct keys.
function buildQueueRows(queue: string[], selected: string[], byId: Map<string, MusicTrack>): QueueRow[] {
  const positions = new Map<string, number[]>()
  queue.forEach((id, index) => {
    const list = positions.get(id)
    if (list) list.push(index)
    else positions.set(id, [index])
  })
  const rows: QueueRow[] = []
  const occurrences = new Map<string, number>()
  for (const id of selected) {
    const track = byId.get(id)
    const index = positions.get(id)?.shift()
    if (!track || index === undefined) continue
    const occurrence = occurrences.get(id) ?? 0
    occurrences.set(id, occurrence + 1)
    rows.push({ track, index, rowKey: `${id}#${occurrence}` })
  }
  return rows
}

interface RowDragContext {
  reorderable: boolean
  index: number
  onDragStartRow: (index: number) => void
  onDropRow: (from: number, to: number) => void
  onDragEndRow: () => void
}

// The dragged row's queue position travels as plain text, same as the playlist
// rows, so a drop outside any queue row simply cannot reorder anything.
function queueDragProps({ reorderable, index, onDragStartRow, onDropRow, onDragEndRow }: RowDragContext) {
  if (!reorderable) return { draggable: false as const }
  return {
    draggable: true as const,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
      onDragStartRow(index)
    },
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      const from = Number(event.dataTransfer.getData('text/plain'))
      if (Number.isInteger(from)) onDropRow(from, index)
      onDragEndRow()
    },
    onDragEnd: onDragEndRow,
  }
}

// A queue of a few hundred rows re-renders as a whole when the list does, so the
// row holds a memo boundary and only sees props that are stable across renders.
const QueueRowItem = memo(function QueueRowItem({
  row,
  rowClassName,
  reorderable,
  isDragSource,
  onDragStartRow,
  onDropRow,
  onDragEndRow,
}: {
  row: QueueRow
  rowClassName?: string
  reorderable: boolean
  isDragSource: boolean
  onDragStartRow: (index: number) => void
  onDropRow: (from: number, to: number) => void
  onDragEndRow: () => void
}) {
  const currentIndex = useMusic((state) => state.currentIndex)
  const isPlaying = useMusic((state) => state.isPlaying)
  const playQueueAt = useMusic((state) => state.playQueueAt)
  const isCurrent = row.index === currentIndex
  return (
    <div
      className={cn('group/queue flex h-9 items-center gap-2 rounded-[var(--r-sm)] px-2', isCurrent && 'bg-[var(--accent-soft)]', isDragSource && 'opacity-40', rowClassName)}
      {...queueDragProps({ reorderable, index: row.index, onDragStartRow, onDropRow, onDragEndRow })}
    >
      <MusicArtwork url={row.track.coverUrl} alt='' className='size-6 rounded-[var(--r-xs)]' iconSize={10} />
      <button
        type='button'
        aria-current={isCurrent ? 'true' : undefined}
        onClick={() => void playQueueAt(row.index)}
        className='min-w-0 flex-1 truncate text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      >
        {row.track.title}
        {/* Decorative: the note is the visual twin of aria-current, so it stays out of the name. */}
        {isCurrent && isPlaying && <span aria-hidden='true'> ♪</span>}
      </button>
      {/* The current row carries a 14% accent tint; the dim tiers fall under AA on it — even
          tertiary, measured over the immersive player's --bg-overlay — so that row's duration
          takes two tiers up, same rule as the sidebar's count badge. */}
      <span className={cn('tabular shrink-0 text-[length:var(--text-10)]', isCurrent ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]')}>{formatTimecode(row.track.durationMs)}</span>
      <QueueRowActions index={row.index} reorderable={reorderable} />
    </div>
  )
})

function QueueRowActions({ index, reorderable }: { index: number; reorderable: boolean }) {
  const queueLength = useMusic((state) => state.queue.length)
  const removeFromQueue = useMusic((state) => state.removeFromQueue)
  const moveQueueItem = useMusic((state) => state.moveQueueItem)
  return (
    <>
      {reorderable && (
        <>
          <IconButton label={t('music.move_up')} size='sm' disabled={index === 0} onClick={() => moveQueueItem(index, index - 1)} className={REVEAL_ON_HOVER}>
            <ArrowUp size={12} />
          </IconButton>
          <IconButton label={t('music.move_down')} size='sm' disabled={index >= queueLength - 1} onClick={() => moveQueueItem(index, index + 1)} className={REVEAL_ON_HOVER}>
            <ArrowDown size={12} />
          </IconButton>
        </>
      )}
      <IconButton label={t('music.remove_from_queue')} size='sm' onClick={() => removeFromQueue(index)} className={REVEAL_ON_HOVER}>
        <X size={12} />
      </IconButton>
    </>
  )
}
