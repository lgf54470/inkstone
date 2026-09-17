import { memo, type ReactNode } from 'react'
import {
  CHART_PADDING,
  axisPeaks,
  barChart,
  baselineY,
  categorySlots,
  lineChart,
  pieChart,
  scatterChart,
  seriesBars,
  seriesLine,
  xyScatter,
  type ChartBox,
  type ChartPoint,
  type ValueSeries,
} from '../chart-geometry'
import { readChartOption, type OptionChart, type OptionSeries } from '../chart-option'
import { t } from '../../../i18n'
import type { ChartElement } from '../types'
import { UnsupportedElement } from './unsupported-element'

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
 * The values a chart draws from its own `data` list, or null when the element carries none.
 * A deck the format's own tool authored keeps its numbers in the engine's `option` instead,
 * which chart-option.ts reads; a chart with neither is announced rather than guessed at — and
 * never mapped blind, which took the whole slide down instead.
 */
function chartPoints(el: ChartElement): ChartPoint[] | null {
  if (!Array.isArray(el.data)) return null
  return el.data.map((datum) => ({ label: datum.label, value: datum.value }))
}

/** The box the marks are drawn in: a title takes its own line off the top of the element's box. */
function plotBoxOf(el: ChartElement): ChartBox {
  return { width: el.w, height: el.h - (el.title ? TITLE_SIZE + TITLE_INSET : 0) }
}

/** The colours a chart's marks take: the deck's palette cycled per value, then the element's own. */
function colorCycle(palette: string[] | undefined, el: ChartElement, defaultAccent: string) {
  return (index: number): string =>
    palette?.[index % Math.max(palette.length, 1)] || el.color || defaultAccent || 'currentColor'
}

/**
 * A chart is drawn as markup rather than onto a canvas: a slide is printed, exported and shown at
 * whatever size the page turns out to be, and vector marks keep all three exact. Both sources come
 * through here: a chart authored here draws its `data` list by preset, a chart from the format's
 * own tool draws the series its `option` states, and a chart with neither says so.
 */
export const SlideChartBlock = memo(function SlideChartBlock({
  el,
  palette,
  defaultAccent,
}: SlideChartBlockProps) {
  const points = chartPoints(el)
  if (points) return <PresetChart el={el} points={points} palette={palette} defaultAccent={defaultAccent} />
  const option = readChartOption(el.option)
  if (option) return <OptionChart el={el} option={option} palette={palette} defaultAccent={defaultAccent} />
  return <UnsupportedElement el={el} reason={el.option ? 'chart: option' : 'chart: data'} />
})

/** The frame both chart sources draw in: one box, one title line, one name for a reader. */
function ChartFrame({ el, children }: { el: ChartElement; children: ReactNode }) {
  const plot = plotBoxOf(el)
  return (
    <div className='size-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
      <svg
        role='img'
        aria-label={el.title || t('slides.insert_chart')}
        data-slide-chart={el.preset}
        viewBox={`0 0 ${el.w} ${el.h}`}
        className='size-full'
      >
        <g transform={`translate(0 ${el.h - plot.height})`}>
          {el.title && (
            <text x={CHART_PADDING} y={CHART_PADDING} fontSize={TITLE_SIZE} fill='var(--text-secondary)'>
              {el.title}
            </text>
          )}
          {children}
        </g>
      </svg>
    </div>
  )
}

/** The marks a chart's own `data` list draws, one preset at a time. */
function PresetChart({
  el,
  points,
  palette,
  defaultAccent,
}: SlideChartBlockProps & { points: ChartPoint[] }) {
  return (
    <ChartFrame el={el}>
      <ChartMarks
        preset={el.preset}
        points={points}
        plot={plotBoxOf(el)}
        colorAt={colorCycle(palette, el, defaultAccent)}
      />
    </ChartFrame>
  )
}

/**
 * The marks a chart's `option` states. A chart authored here keeps its values in `data` and is
 * drawn by preset above instead; one that reaches this point carries them in the format engine's
 * option, whose series kinds decide the marks (a bar beside a line is exactly that) and whose
 * `yAxisIndex` decides which value axis scales a series. The option's own colour list comes
 * first, since the file chose it, and the deck's palette stands behind it.
 */
function OptionChart({ el, option, palette, defaultAccent }: SlideChartBlockProps & { option: OptionChart }) {
  const fallback = colorCycle(palette, el, defaultAccent)
  const colors = option.colors
  const colorAt = (index: number): string =>
    colors[index % Math.max(colors.length, 1)] || fallback(index)
  return (
    <ChartFrame el={el}>
      <OptionMarks chart={option} plot={plotBoxOf(el)} colorAt={colorAt} />
    </ChartFrame>
  )
}

interface MarksProps {
  points: ChartPoint[]
  plot: ChartBox
  colorAt: (index: number) => string
}

/** A pie is one series of slices; anything else is series standing on a shared category axis. */
function OptionMarks({ chart, plot, colorAt }: {
  chart: OptionChart
  plot: ChartBox
  colorAt: (index: number) => string
}) {
  const pie = chart.series.find((one) => one.kind === 'pie')
  if (pie) return <OptionPie series={pie} plot={plot} colorAt={colorAt} />

  const series: ValueSeries[] = chart.series.flatMap((one) =>
    one.kind === 'pie' ? [] : [{ kind: one.kind, values: one.values, pairs: one.pairs, axis: one.axis }],
  )
  const peaks = axisPeaks(series)
  const placed = series.filter((one) => one.kind !== 'scatter')
  const slots = placed.reduce((most, one) => Math.max(most, one.values.length), 0)
  // Only bars take a band inside a slot: a line or a scatter beside them is drawn over the slot
  // rather than beside the bars, which is what the format's own engine does.
  const bars = placed.filter((one) => one.kind === 'bar')

  return (
    <g>
      {bars.length > 0 && (
        <line
          x1={CHART_PADDING}
          y1={baselineY(plot)}
          x2={plot.width + CHART_PADDING}
          y2={baselineY(plot)}
          stroke='var(--border-subtle)'
        />
      )}
      {series.map((one, index) => (
        <OptionSeriesMarks
          key={`m-${index}`}
          series={one}
          seriesIndex={index}
          barIndex={bars.indexOf(one)}
          seriesCount={bars.length}
          peak={peaks[one.axis]}
          labels={chart.categories}
          plot={plot}
          colorAt={colorAt}
        />
      ))}
      {slots > 0 && <CategoryLabels labels={chart.categories} count={slots} plot={plot} />}
    </g>
  )
}

/** The slices one pie series states, named by the option and coloured by its own colour list. */
function OptionPie({
  series,
  plot,
  colorAt,
}: {
  series: OptionSeries
  plot: ChartBox
  colorAt: (index: number) => string
}) {
  const slices = pieChart(
    series.names.map((label, index) => ({ label, value: series.values[index] ?? 0 })),
    plot,
  )
  return (
    <g>
      {slices.map((slice) => (
        <path key={`s-${slice.index}`} data-slice d={slice.d} fill={colorAt(slice.index)} />
      ))}
    </g>
  )
}

/** One series' own marks: grouped bars, a polyline through the slots, or dots at its own pairs. */
function OptionSeriesMarks({
  series,
  seriesIndex,
  barIndex,
  seriesCount,
  peak,
  labels,
  plot,
  colorAt,
}: {
  series: ValueSeries
  seriesIndex: number
  barIndex: number
  seriesCount: number
  peak: number
  labels: string[]
  plot: ChartBox
  colorAt: (index: number) => string
}) {
  const color = colorAt(seriesIndex)
  if (series.kind === 'scatter') {
    return (
      <g>
        {xyScatter({ pairs: series.pairs, seriesIndex, box: plot }).map((dot, index) => (
          <circle key={`p-${index}`} data-point cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={color} />
        ))}
      </g>
    )
  }
  if (series.kind === 'line') {
    const { d, dots } = seriesLine({ values: series.values, seriesIndex, peak, box: plot })
    return (
      <g>
        <path data-line d={d} fill='none' stroke={color} strokeWidth={STROKE_WIDTH} />
        {dots.map((dot, index) => (
          <circle key={`d-${index}`} data-point cx={dot.x} cy={dot.y} r={DOT_RADIUS} fill={color} />
        ))}
      </g>
    )
  }
  return (
    <g>
      {seriesBars({ values: series.values, seriesIndex: barIndex, seriesCount, peak, labels, box: plot }).map((rect, index) => (
        <rect
          key={`b-${index}`}
          data-bar
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={2}
          fill={color}
        />
      ))}
    </g>
  )
}

/** The category labels, drawn once under the slots every category mark stands in. */
function CategoryLabels({ labels, count, plot }: { labels: string[]; count: number; plot: ChartBox }) {
  const { slot, baseline } = categorySlots(plot, count)
  return (
    <g>
      {labels.slice(0, count).map((label, index) => (
        <AxisLabel
          key={`c-${index}`}
          x={CHART_PADDING + (index + 0.5) * slot}
          y={baseline + LABEL_SIZE + LABEL_INSET}
          label={label}
        />
      ))}
    </g>
  )
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
