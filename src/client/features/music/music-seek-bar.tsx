import { useCallback, useState, type CSSProperties } from 'react'
import { cn } from '../../lib/cn'
import { formatTimecode } from '../../lib/time'

export function MusicSeekBar({
  valueMs,
  durationMs,
  onSeek,
  label,
  showTime = false,
  className,
  loopRange = null,
}: {
  valueMs: number
  durationMs: number
  onSeek: (ms: number) => void
  label: string
  showTime?: boolean
  className?: string
  /** A closed A-B range already filtered to the playing track (see useActiveLoopRange). */
  loopRange?: { startMs: number; endMs: number | null } | null
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
  const region = loopRange ? loopGeometry(loopRange, max) : null
  const input = (
    <input
      type='range'
      // Deliberately no `outline-none`: the base layer gives every :focus-visible element a
      // ring, and a utility beats it, so suppressing it here left keyboard users scrubbing a
      // playhead with no visible caret. The shared Slider in components/form draws the same
      // control and has never suppressed it.
      className={cn('ink-slider h-[var(--sp-3-5)] cursor-pointer appearance-none bg-transparent', region ? 'w-full' : 'min-w-0 flex-1')}
      style={{ '--pct': `${(value / max) * 100}%` } as CSSProperties}
      min={0}
      max={max}
      step={1000}
      value={value}
      aria-label={label}
      aria-valuetext={formatTimecode(value)}
      onChange={(event) => setDraggingMs(Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  )
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-[var(--sp-2)]', className)}>
      {showTime && <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatTimecode(value)}</span>}
      {region ? (
        // The strip paints above the track but never catches the pointer, so the
        // thumb and scrubbing keep their native behaviour underneath it.
        <span className='relative h-[var(--sp-3-5)] min-w-0 flex-1'>
          {input}
          <span data-loop-region aria-hidden className='pointer-events-none absolute inset-y-0 rounded-[var(--r-sm)] bg-[var(--accent-soft)]' style={region} />
        </span>
      ) : input}
      {showTime && <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{formatTimecode(durationMs)}</span>}
    </div>
  )
}

// Percent of the track, clamped so a drifting or hand-edited range can never push
// the strip outside the bar. An open range (no B yet) draws nothing.
function loopGeometry(loopRange: { startMs: number; endMs: number | null }, max: number): CSSProperties | null {
  if (loopRange.endMs === null) return null
  return {
    left: `${Math.min(Math.max((loopRange.startMs / max) * 100, 0), 100)}%`,
    width: `${Math.min(Math.max(((loopRange.endMs - loopRange.startMs) / max) * 100, 0), 100)}%`,
  }
}
