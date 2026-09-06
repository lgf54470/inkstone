import { useId } from 'react'
import type { ShareTimelinePoint } from '@shared/types'

const CHART_W = 800
const CHART_H = 220
const PAD_L = 36
const PAD_R = 12
const PAD_T = 10
const PAD_B = 24
const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1]
const LABEL_STEP_MIN = { 10: 2, 20: 4 } as const

interface ChartGeometry {
  maxVal: number
  innerH: number
  baseY: number
  pts: Array<[number, number]>
  solidLine: string
  area: string
}

function chartGeometryOf(values: number[]): ChartGeometry {
  const maxVal = Math.max(...values, 1)
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
  return { maxVal, innerH, baseY, pts, solidLine, area }
}

function chartGradientId(): string {
  return `bigChartGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function ChartGridLines({ maxVal }: { maxVal: number }) {
  const innerH = CHART_H - PAD_T - PAD_B
  return (
    <>
      {GRID_STEPS.map((g, gi) => {
        const gy = PAD_T + innerH * (1 - g)
        const val = Math.round(maxVal * g)
        return (
          <g key={gi}>
            <line x1={PAD_L} x2={CHART_W - PAD_R} y1={gy} y2={gy} stroke="var(--border-subtle)" strokeDasharray="2 2" strokeWidth="1" />
            <text x={PAD_L - 6} y={gy + 3} fontSize="9" fill="var(--text-tertiary)" textAnchor="end" fontFamily="var(--font-family-mono, monospace)">
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
        <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="3" fill="var(--bg-card)" stroke="var(--accent)" strokeWidth="2">
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
          <text key={`lbl-${i}`} x={p[0].toFixed(1)} y={CHART_H - 6} fontSize="9" fill="var(--text-tertiary)" textAnchor="middle" fontFamily="var(--font-family-mono, monospace)">
            {timeline[i]?.label || ''}
          </text>
        )
      })}
    </>
  )
}

function ChartEmptyState({ emptyLabel }: { emptyLabel: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
      {emptyLabel}
    </div>
  )
}

export function BigSvgChart({ values, timeline, emptyLabel }: { values: number[]; timeline: ShareTimelinePoint[]; emptyLabel: string }) {
  const gradId = chartGradientId()

  if (values.length === 0) {
    return <ChartEmptyState emptyLabel={emptyLabel} />
  }

  const geometry = chartGeometryOf(values)

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      <ChartGridLines maxVal={geometry.maxVal} />

      {geometry.area && <path d={geometry.area} fill={`url(#${gradId})`} />}

      <path d={geometry.solidLine} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      <ChartDots geometry={geometry} values={values} timeline={timeline} />
      <ChartXLabels geometry={geometry} values={values} timeline={timeline} />
    </svg>
  )
}
