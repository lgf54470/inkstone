import { memo } from 'react'
import {
  CHART_PADDING,
  barChart,
  lineChart,
  pieChart,
  scatterChart,
  type ChartBox,
  type ChartPoint,
} from '../chart-geometry'
import { t } from '../../../i18n'
import type { ChartElement } from '../types'

const LABEL_SIZE = 11
const LABEL_INSET = 4
const STROKE_WIDTH = 2
const DOT_RADIUS = 3.5
const TITLE_SIZE = 13
const TITLE_INSET = 4

interface SlideChartBlockProps {
  el: ChartElement
  /** The deck's chart colours, cycled per value; the element's own colour is the fallback. */
  palette?: string[]
  defaultAccent: string
}

/**
 * A chart is drawn as markup rather than onto a canvas: a slide is printed, exported and
 * shown at whatever size the page turns out to be, and vector marks keep all three exact.
 * The preset decides the marks — bars, a polyline, wedges, points — and the deck's palette
 * decides their colours, so recolouring a deck's charts needs no edit here.
 */
export const SlideChartBlock = memo(function SlideChartBlock({
  el,
  palette,
  defaultAccent,
}: SlideChartBlockProps) {
  const box: ChartBox = { width: el.w, height: el.h }
  const points: ChartPoint[] = el.data.map((datum) => ({
    label: datum.label,
    value: datum.value,
  }))
  const colorAt = (index: number): string =>
    palette?.[index % Math.max(palette.length, 1)] || el.color || defaultAccent || 'currentColor'
  const plotTop = el.title ? CHART_PADDING + TITLE_SIZE + TITLE_INSET : CHART_PADDING
  const plot: ChartBox = { width: box.width, height: box.height - (plotTop - CHART_PADDING) }

  return (
    <div className='size-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
      <svg
        role='img'
        aria-label={el.title || t('slides.insert_chart')}
        data-slide-chart={el.preset}
        viewBox={`0 0 ${box.width} ${box.height}`}
        className='size-full'
      >
        <g transform={`translate(0 ${plotTop - CHART_PADDING})`}>
          {el.title && (
            <text
              x={CHART_PADDING}
              y={CHART_PADDING}
              fontSize={TITLE_SIZE}
              fill='var(--text-secondary)'
            >
              {el.title}
            </text>
          )}
          <ChartMarks preset={el.preset} points={points} plot={plot} colorAt={colorAt} />
        </g>
      </svg>
    </div>
  )
})

interface MarksProps {
  points: ChartPoint[]
  plot: ChartBox
  colorAt: (index: number) => string
}

function AxisLabel({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <text x={x} y={y} fontSize={LABEL_SIZE} textAnchor='middle' fill='var(--text-tertiary)'>
      {label}
    </text>
  )
}

function PieMarks({ points, plot, colorAt }: MarksProps) {
  return (
    <g>
      {pieChart(points, plot).map((slice) => (
        <path key={slice.index} data-slice d={slice.d} fill={colorAt(slice.index)} />
      ))}
    </g>
  )
}

function LineMarks({ points, plot, colorAt }: MarksProps) {
  const { d, dots } = lineChart(points, plot)
  const labelY = plot.height + CHART_PADDING - LABEL_INSET
  return (
    <g>
      {dots.map((dot, index) => (
        <AxisLabel key={`x-${index}`} x={dot.x} y={labelY} label={points[index]!.label} />
      ))}
      <path data-line d={d} fill='none' stroke={colorAt(0)} strokeWidth={STROKE_WIDTH} />
      {dots.map((dot, index) => (
        <circle key={`d-${index}`} data-point cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={colorAt(0)} />
      ))}
    </g>
  )
}

function ScatterMarks({ points, plot, colorAt }: MarksProps) {
  return (
    <g>
      {scatterChart(points, plot).map((dot, index) => (
        <circle key={`p-${index}`} data-point cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={colorAt(index)} />
      ))}
    </g>
  )
}

function BarMarks({ points, plot, colorAt }: MarksProps) {
  const { rects, baseline } = barChart(points, plot)
  return (
    <g>
      <line
        x1={CHART_PADDING}
        y1={baseline}
        x2={plot.width + CHART_PADDING}
        y2={baseline}
        stroke='var(--border-subtle)'
      />
      {rects.map((rect, index) => (
        <rect
          key={`b-${index}`}
          data-bar
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={2}
          fill={colorAt(index)}
        />
      ))}
      {rects.map((rect, index) => (
        <AxisLabel
          key={`l-${index}`}
          x={rect.x + rect.width / 2}
          y={baseline + LABEL_SIZE + LABEL_INSET}
          label={rect.label}
        />
      ))}
    </g>
  )
}

function ChartMarks({ preset, ...marks }: MarksProps & { preset: ChartElement['preset'] }) {
  if (preset === 'line') return <LineMarks {...marks} />
  if (preset === 'pie') return <PieMarks {...marks} />
  if (preset === 'scatter') return <ScatterMarks {...marks} />
  return <BarMarks {...marks} />
}
