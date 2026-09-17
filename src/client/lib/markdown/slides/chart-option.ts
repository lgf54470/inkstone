/**
 * The format's chart engine carries a chart's values inside an `option` object (charts-lite),
 * which is not the `data` list a chart authored here keeps. This reads the parts a picture
 * needs — each series and its kind, the categories they stand on, a pie's slice names, a
 * scatter's pairs, and which value axis scales each series — and refuses everything else: a
 * series kind this build does not draw, a third axis it cannot scale, or a body of values it
 * cannot read whole. A refusal is announced by the chart block, never approximated into a
 * picture the document did not ask for.
 */
export type OptionMarkKind = 'bar' | 'line' | 'pie' | 'scatter'

export interface OptionSeries {
  kind: OptionMarkKind
  /** bar/line: one value per category; pie: one per slice; scatter: the y of each pair. */
  values: number[]
  /** What the values are called: a pie's slice names, else the category labels they stand on. */
  names: string[]
  /** Scatter is the one kind whose x is data rather than a slot, so it keeps its pairs. */
  pairs: { x: number; y: number }[]
  /** Which value axis scales this series: a second axis is a scale of its own. */
  axis: 0 | 1
}

export interface OptionChart {
  categories: string[]
  series: OptionSeries[]
  /** The colours the option names, if it names any; the deck's palette stands behind them. */
  colors: string[]
}

const MARK_KINDS: OptionMarkKind[] = ['bar', 'line', 'pie', 'scatter']

export function readChartOption(option: unknown): OptionChart | null {
  const root = asRecord(option)
  const rawSeries = root && Array.isArray(root.series) ? root.series : null
  if (!root || !rawSeries || rawSeries.length === 0) return null

  const categories = readCategories(root)
  const series: OptionSeries[] = []
  for (const raw of rawSeries) {
    const one = readSeries(raw, categories)
    if (!one) return null
    series.push(one)
  }
  if (!pieStandsAlone(series)) return null
  return { categories, series, colors: asColors(root.color) }
}

/** A pie is the whole picture: a series of any other kind beside it has nowhere to be drawn. */
function pieStandsAlone(series: OptionSeries[]): boolean {
  const pies = series.filter((one) => one.kind === 'pie').length
  return pies === 0 || (pies === 1 && series.length === 1)
}

function readSeries(value: unknown, categories: string[]): OptionSeries | null {
  const raw = asRecord(value)
  const kind = raw ? MARK_KINDS.find((one) => one === raw.type) : undefined
  if (!raw || !kind) return null
  const axis = readAxis(raw.yAxisIndex)
  if (axis === null) return null
  if (kind === 'pie') return readPie(raw, categories, axis)
  if (kind === 'scatter') return readScatter(raw, axis)
  const values = readNumbers(raw.data)
  if (!values) return null
  return { kind, values, names: labelsFor(categories, values.length), pairs: [], axis }
}

/** The third value axis and beyond have no scale here, so a series that names one is refused. */
function readAxis(value: unknown): 0 | 1 | null {
  if (value === undefined || value === 0) return 0
  if (value === 1) return 1
  return null
}

function readPie(raw: Record<string, unknown>, categories: string[], axis: 0 | 1): OptionSeries | null {
  if (!Array.isArray(raw.data)) return null
  const values: number[] = []
  const names: string[] = []
  for (const item of raw.data) {
    const entry = asRecord(item)
    const value = readValue(entry ? entry.value : item)
    if (value === null) return null
    values.push(value)
    names.push(entry && typeof entry.name === 'string' ? entry.name : categories[values.length - 1] ?? '')
  }
  if (values.length === 0) return null
  return { kind: 'pie', values, names, pairs: [], axis }
}

function readScatter(raw: Record<string, unknown>, axis: 0 | 1): OptionSeries | null {
  if (!Array.isArray(raw.data)) return null
  const pairs: { x: number; y: number }[] = []
  for (const item of raw.data) {
    const stated = Array.isArray(item) ? item : asRecord(item)?.value
    const x = Array.isArray(stated) ? readValue(stated[0]) : null
    const y = Array.isArray(stated) ? readValue(stated[1]) : null
    if (x === null || y === null) return null
    pairs.push({ x, y })
  }
  if (pairs.length === 0) return null
  return { kind: 'scatter', values: pairs.map((pair) => pair.y), names: [], pairs, axis }
}

/** A number as the engine states it: the value itself, or the object form it also takes. */
function readValue(value: unknown): number | null {
  const stated = asRecord(value) ? asRecord(value)?.value : value
  return typeof stated === 'number' && Number.isFinite(stated) ? stated : null
}

function readNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const numbers: number[] = []
  for (const item of value) {
    const one = readValue(item)
    if (one === null) return null
    numbers.push(one)
  }
  return numbers
}

function readCategories(root: Record<string, unknown>): string[] {
  const stated = Array.isArray(root.xAxis) ? root.xAxis[0] : root.xAxis
  return asStrings(asRecord(stated)?.data)
}

/**
 * One label per value. A value with no category of its own gets none rather than an invented
 * one: the axis is drawn short of a name, which is a fact about the document, not a claim.
 */
function labelsFor(categories: string[], count: number): string[] {
  return Array.from({ length: count }, (_one, index) => categories[index] ?? '')
}

/** A category may be a number where a colour may not: a colour that is not a string is not one. */
function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((one) => typeof one === 'string' || typeof one === 'number').map((one) => String(one))
}

function asColors(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one) => typeof one === 'string') : []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
