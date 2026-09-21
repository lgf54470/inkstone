import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { formatNumber } from '../lib/time'

export function KpiCard({
  icon,
  label,
  value,
  delta,
  deltaHint,
  sparkline,
  unavailable,
}: {
  icon: React.ReactNode
  label: string
  value: number
  delta?: number
  /** What the percentage is measured against, read to screen readers only ("vs previous period"). */
  deltaHint?: string
  sparkline?: number[]
  /**
   * Shown instead of the number when this instance cannot collect it at all. A zero would answer a
   * question nobody asked — "nobody visited" — where the truth is "not counted here".
   */
  unavailable?: string
}) {
  return (
    <div className='flex flex-col justify-between rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between text-[var(--text-tertiary)]'>
        <span className='text-[length:var(--text-12)] font-medium'>{label}</span>
        {icon}
      </div>

      <div className='flex items-baseline justify-between pt-2'>
        <span className='font-mono text-[length:var(--text-24)] font-bold tracking-tight text-[var(--text-primary)]'>
          {unavailable ?? formatNumber(value)}
        </span>

        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[length:var(--text-11)] font-medium ${
              delta === 0 ? 'text-[var(--text-tertiary)]' : delta > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }`}
          >
            {delta === 0 ? <Minus size={12} aria-hidden /> : delta > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {delta > 0 ? `+${delta}%` : `${delta}%`}
            {/* The arrow says nothing to a screen reader, and the percentage needs what it was
                measured against. That hint used to ride on an `aria-label` here, which a span with no
                role may not carry: axe reports it as `aria-prohibited-attr` and the attribute is
                dropped, so the badge read as a bare percentage. The fixture account never painted a
                badge at all (no traffic, no delta — SH-103), which is why it went unnoticed
                (SH-102). Visually hidden text needs no role: it is read where it sits, so the badge
                still says "+12% against the previous period". */}
            {deltaHint && <span className='sr-only'> {deltaHint}</span>}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && sparkline.some((v) => v > 0) && (
        // The line repeats the number above it, so it stays out of the reading order.
        <div className='mt-2 h-7 w-full' aria-hidden>
          <MiniSparkline values={sparkline} />
        </div>
      )}
    </div>
  )
}

export function BreakdownRow({
  name,
  flag,
  count,
  percentage,
}: {
  name: string
  flag?: string
  count: number
  percentage: number
}) {
  return (
    <div className='flex flex-col gap-1 text-[length:var(--text-12)]'>
      <div className='flex items-center justify-between'>
        <span className='flex items-center gap-1.5 truncate text-[var(--text-primary)]'>
          {flag && <span className='text-[length:var(--text-13)]'>{flag}</span>}
          <span className='truncate'>{name}</span>
        </span>
        <div className='flex items-center gap-2 font-mono text-[length:var(--text-11)]'>
          <span className='font-semibold text-[var(--text-primary)]'>{formatNumber(count)}</span>
          <span className='w-8 text-right text-[var(--text-tertiary)]'>{formatNumber(percentage)}%</span>
        </div>
      </div>
      <div className='h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden'>
        <div
          className='h-full rounded-full bg-[var(--accent)] transition-all'
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}


function MiniSparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const min = 0
  const width = 100
  const height = 28
  const step = width / Math.max(1, values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / (max - min)) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const linePath = `M${points.join(' L')}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className='h-full w-full overflow-visible'>
      <path
        d={linePath}
        fill='none'
        stroke='var(--accent)'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}