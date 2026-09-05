import { useId } from 'react'
import type { ShareTimelinePoint } from '@shared/types'

export function BigSvgChart({
  values,
  timeline,
  emptyLabel,
}: {
  values: number[]
  timeline: ShareTimelinePoint[]
  emptyLabel: string
}) {
  const gradId = `bigChartGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (values.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
        {emptyLabel}
      </div>
    )
  }

  const W = 800
  const H = 220
  const PAD = { l: 36, r: 12, t: 10, b: 24 }

  const maxVal = Math.max(...values, 1)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0

  const pts: Array<[number, number]> = values.map((val, i) => {
    const x = values.length > 1 ? PAD.l + i * stepX : PAD.l + innerW / 2
    const y = PAD.t + innerH - (val / maxVal) * innerH
    return [x, y]
  })

  const solidLine = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ')

  const baseY = PAD.t + innerH
  const area =
    pts.length > 1
      ? `${solidLine} L${pts[pts.length - 1][0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`
      : ''

  const gridSteps = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {gridSteps.map((g, gi) => {
        const gy = PAD.t + innerH * (1 - g)
        const val = Math.round(maxVal * g)
        return (
          <g key={gi}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={gy}
              y2={gy}
              stroke="var(--border-subtle)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <text
              x={PAD.l - 6}
              y={gy + 3}
              fontSize="9"
              fill="var(--text-tertiary)"
              textAnchor="end"
              fontFamily="var(--font-family-mono, monospace)"
            >
              {val}
            </text>
          </g>
        )
      })}

      {area && <path d={area} fill={`url(#${gradId})`} />}

      <path
        d={solidLine}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {pts.map((p, i) => {
        const item = timeline[i]
        return (
          <circle
            key={i}
            cx={p[0].toFixed(1)}
            cy={p[1].toFixed(1)}
            r="3"
            fill="var(--bg-card)"
            stroke="var(--accent)"
            strokeWidth="2"
          >
            <title>{`${item?.label}: ${values[i]}`}</title>
          </circle>
        )
      })}

      {pts.map((p, i) => {
        const interval = values.length > 20 ? 4 : values.length > 10 ? 2 : 1
        if (i % interval !== 0 && i !== values.length - 1) return null
        const item = timeline[i]
        return (
          <text
            key={`lbl-${i}`}
            x={p[0].toFixed(1)}
            y={H - 6}
            fontSize="9"
            fill="var(--text-tertiary)"
            textAnchor="middle"
            fontFamily="var(--font-family-mono, monospace)"
          >
            {item?.label || ''}
          </text>
        )
      })}
    </svg>
  )
}