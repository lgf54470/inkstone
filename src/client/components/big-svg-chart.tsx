import { useId } from 'react'
import type { ShareTimelinePoint } from '@shared/types'

const CHART_W = 800
const CHART_H = 220
const PAD_L = 36
const PAD_R = 12
const PAD_T = 10
const PAD_B = 24
const AXIS_DIVISIONS = [5, 4, 2] as const
const LABEL_STEP_MIN = { 10: 2, 20: 4 } as const
const AXIS_LABEL_FONT_SIZE = '9'

/**
 * What the chart says in words: the zone's total, and the peak with the label it happened under.
 * Callers put those three into their own localized sentence for the chart's accessible name — the
 * drawing itself is not readable by a screen reader, and the per-point `<title>` only answers a
 * pointer.
 */
export function chartSummary(values: number[], labels: string[]): { total: number; peak: number; peakLabel: string } {
  let peakIndex = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[peakIndex]) peakIndex = i
  }
  return {
    total: values.reduce((sum, v) => sum + v, 0),
    peak: values[peakIndex] ?? 0,
    peakLabel: labels[peakIndex] ?? '',
  }
}

/** A ceiling a reader can count by: 1, 2 or 5 × 10ⁿ at or above the peak. */
function niceCeiling(peak: number): number {
  if (!Number.isFinite(peak) || peak <= 1) return 1
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  for (const sieve of [1, 2, 5, 10]) {
    const candidate = sieve * magnitude
    if (candidate >= peak) return candidate
  }
  return 10 * magnitude
}

/**
 * The grid's label values, bottom to top, always distinct. Quarter steps of the old fixed scale were
 * rounded to integers for the labels, so a peak of 3 read 1/2/2/3 and a peak of 1 read 1/1/1/0 —
 * the whole axis said one thing. The ceiling picks the division instead: five when it divides
 * evenly, then four, then the halving; when even that is fractional (a peak of 1) the grid is the
 * two lines that differ rather than five that do not.
 */
export function chartAxisTicks(peak: number): number[] {
  const max = niceCeiling(peak)
  for (const divisions of AXIS_DIVISIONS) {
    if (max % divisions === 0) {
      const step = max / divisions
      return Array.from({ length: divisions + 1 }, (_, index) => index * step)
    }
  }
  return [0, max]
}

interface ChartGeometry {
  maxVal: number
  ticks: number[]
  innerH: number
  baseY: number
  pts: Array<[number, number]>
  solidLine: string
  area: string
}

function chartGeometryOf(values: number[]): ChartGeometry {
  const ticks = chartAxisTicks(Math.max(...values, 0))
  const maxVal = ticks[ticks.length - 1] ?? 1
  const innerW = CHART_W - PAD_L - PAD_R
  const innerH = CHART_H - PAD_T - PAD_B
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0
  const pts: Array<[number, number]> = values.map((val, i) => {
    const x = values.length > 1 ? PAD_L + i * stepX : PAD_L + innerW / 2
    const y = PAD_T + innerH - (val / maxVal) * innerH
    return [x, y]
  })
  const solidLine = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ')
  const baseY = PAD_T + innerH
  const area =
    pts.length > 1
      ? `${solidLine} L${pts[pts.length - 1][0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`
      : ''
  return { maxVal, ticks, innerH, baseY, pts, solidLine, area }
}

function chartGradientId(): string {
  return `bigChartGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function ChartGridLines({ ticks, maxVal }: { ticks: number[]; maxVal: number }) {
  const innerH = CHART_H - PAD_T - PAD_B
  return (
    <>
      {ticks.map((val) => {
        const gy = PAD_T + innerH * (1 - val / maxVal)
        return (
          <g key={val}>
            <line x1={PAD_L} x2={CHART_W - PAD_R} y1={gy} y2={gy} stroke='var(--border-subtle)' strokeDasharray='2 2' strokeWidth='1' />
            <text x={PAD_L - 6} y={gy + 3} fontSize={AXIS_LABEL_FONT_SIZE} fill='var(--text-tertiary)' textAnchor='end' fontFamily='var(--font-mono, monospace)'>
              {val}
            </text>
          </g>
        )
      })}
    </>
  )
}

function ChartDots({ geometry, values, timeline }: { geometry: ChartGeometry; values: number[]; timeline: ShareTimelinePoint[] }) {
  return (
    <>
      {geometry.pts.map((p, i) => (
        <circle key={timeline[i]?.label || `dot-${i}`} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r='3' fill='var(--bg-card)' stroke='var(--accent)' strokeWidth='2'>
          <title>{`${timeline[i]?.label}: ${values[i]}`}</title>
        </circle>
      ))}
    </>
  )
}

function ChartXLabels({ geometry, values, timeline }: { geometry: ChartGeometry; values: number[]; timeline: ShareTimelinePoint[] }) {
  const interval = values.length > 20 ? LABEL_STEP_MIN[20] : values.length > 10 ? LABEL_STEP_MIN[10] : 1
  return (
    <>
      {geometry.pts.map((p, i) => {
        if (i % interval !== 0 && i !== values.length - 1) return null
        return (
          <text key={`lbl-${i}`} x={p[0].toFixed(1)} y={CHART_H - 6} fontSize={AXIS_LABEL_FONT_SIZE} fill='var(--text-tertiary)' textAnchor='middle' fontFamily='var(--font-mono, monospace)'>
            {timeline[i]?.label || ''}
          </text>
        )
      })}
    </>
  )
}

function ChartEmptyState({ emptyLabel }: { emptyLabel: string }) {
  return (
    <div className='flex h-full items-center justify-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
      {emptyLabel}
    </div>
  )
}

export function BigSvgChart({ values, timeline, emptyLabel, ariaLabel }: { values: number[]; timeline: ShareTimelinePoint[]; emptyLabel: string; ariaLabel: string }) {
  const gradId = chartGradientId()

  if (!values.some((v) => v > 0)) {
    return <ChartEmptyState emptyLabel={emptyLabel} />
  }

  const geometry = chartGeometryOf(values)

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio='xMidYMid meet' className='h-full w-full' role='img' aria-label={ariaLabel} focusable='false'>
      <defs>
        <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor='var(--accent)' stopOpacity='0.35' />
          <stop offset='100%' stopColor='var(--accent)' stopOpacity='0.0' />
        </linearGradient>
      </defs>

      <ChartGridLines ticks={geometry.ticks} maxVal={geometry.maxVal} />

      {geometry.area && <path d={geometry.area} fill={`url(#${gradId})`} />}

      <path d={geometry.solidLine} fill='none' stroke='var(--accent)' strokeWidth='2' strokeLinejoin='round' strokeLinecap='round' />

      <ChartDots geometry={geometry} values={values} timeline={timeline} />
      <ChartXLabels geometry={geometry} values={values} timeline={timeline} />
    </svg>
  )
}
