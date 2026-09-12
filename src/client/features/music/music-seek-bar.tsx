import { useCallback, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn'
import { formatDuration } from './music-utils'

export function MusicSeekBar({
  valueMs,
  durationMs,
  onSeek,
  label,
  showTime = false,
  className,
}: {
  valueMs: number
  durationMs: number
  onSeek: (ms: number) => void
  label: string
  showTime?: boolean
  className?: string
}) {
  const [draggingMs, setDraggingMs] = useState<number | null>(null)
  const max = durationMs > 0 ? durationMs : 1
  const value = Math.min(Math.max(draggingMs ?? valueMs, 0), max)
  const commit = useCallback(() => {
    setDraggingMs((pending) => {
      if (pending !== null) onSeek(pending)
      return null
    })
  }, [onSeek])
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      {showTime && <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatDuration(value)}</span>}
      <input
        type='range'
        className='ink-slider h-3.5 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent outline-none'
        style={{ '--pct': `${(value / max) * 100}%` } as CSSProperties}
        min={0}
        max={max}
        step={1000}
        value={value}
        aria-label={label}
        aria-valuetext={formatDuration(value)}
        onChange={(event) => setDraggingMs(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {showTime && <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatDuration(durationMs)}</span>}
    </div>
  )
}
