/**
 * The pair of translations between a chart table (./table) and a chart.js config.
 *
 * Both directions are total in one direction and partial in the other: a table always means *some*
 * config, but a config means a table only when everything in it survives being written as one. So
 * {@link chartConfigToTable} refuses rather than approximating — a toggle that quietly dropped a
 * second axis would leave the note drawing a different chart than it did before the press.
 */
import { resolveScatterColumns } from './columns'
import { cellNumber, type ChartTable } from './table'

/** The kinds a chart.js fence draws from a table. `scatter` becomes `bubble` when a size column is read. */
export const CHART_TABLE_KINDS = ['line', 'bar', 'radar', 'pie', 'doughnut', 'polarArea', 'scatter'] as const
export type ChartTableKind = typeof CHART_TABLE_KINDS[number]

/** Kinds the shared syntax accepts but only the echarts fence can draw. */
export const ECHARTS_ONLY_KINDS = ['heatmap', 'sankey', 'map'] as const

export type ChartConfigReason = 'needs-echarts' | 'unknown-kind' | 'empty-table' | 'too-narrow' | 'bad-mapping'

export class ChartConfigError extends Error {
  constructor(readonly reason: ChartConfigReason, readonly kind = '') {
    super(reason)
  }
}

/** A config that will not survive the round trip, and why the toggle should decline to offer it. */
export type ChartTableLoss = 'not-a-config' | 'unknown-kind' | 'needs-echarts' | 'lossy'
export type ChartTableConversion = { ok: true; table: ChartTable } | { ok: false; reason: ChartTableLoss }

const AXIS_KINDS: readonly string[] = ['line', 'bar', 'radar']
const SLICE_KINDS: readonly string[] = ['pie', 'doughnut', 'polarArea']
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNumberArray(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

/** The keyword cell's own configuration: `title` becomes the plugin, everything else is passed through. */
function keywordOptions(table: ChartTable): Record<string, unknown> {
  const { title, ...rest } = table.options
  const options: Record<string, unknown> = { ...rest }
  if (typeof title === 'string' && title.length > 0) {
    const plugins = isRecord(rest.plugins) ? { ...rest.plugins } : {}
    plugins.title = { display: true, text: title }
    options.plugins = plugins
  }
  return options
}

function axisSeries(table: ChartTable): Record<string, unknown>[] {
  if (table.header.length < 2) throw new ChartConfigError('too-narrow', table.kind)
  if (table.rows.length === 0) throw new ChartConfigError('empty-table', table.kind)
  return table.rows.map((row) => ({ label: row[0] ?? '', data: row.slice(1).map(cellNumber) }))
}

function sliceSeries(table: ChartTable): Record<string, unknown>[] {
  if (table.header.length < 2) throw new ChartConfigError('too-narrow', table.kind)
  if (table.rows.length === 0) throw new ChartConfigError('empty-table', table.kind)
  return [{ data: table.rows.map((row) => cellNumber(row[1])) }]
}

function scatterSeries(table: ChartTable): { type: string; datasets: Record<string, unknown>[] } {
  const columns = resolveScatterColumns(table)
  if (!columns) throw new ChartConfigError('bad-mapping', table.kind)
  const { x, y, size, series } = columns
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of table.rows) {
    const point: Record<string, unknown> = { x: cellNumber(row[x]), y: cellNumber(row[y]) }
    if (row[0]) point.name = row[0]
    if (size >= 0) point.r = cellNumber(row[size])
    const key = series >= 0 ? row[series] ?? '' : ''
    groups.set(key, [...(groups.get(key) ?? []), point])
  }
  return { type: size >= 0 ? 'bubble' : 'scatter', datasets: [...groups].map(([label, data]) => (label ? { label, data } : { data })) }
}

export function tableToChartConfig(table: ChartTable): Record<string, unknown> {
  const kind = table.kind.toLowerCase()
  if ((ECHARTS_ONLY_KINDS as readonly string[]).includes(kind)) throw new ChartConfigError('needs-echarts', kind)
  if (!(CHART_TABLE_KINDS as readonly string[]).includes(kind)) throw new ChartConfigError('unknown-kind', kind)
  const shape = kind === 'scatter' ? scatterSeries(table) : { type: kind, datasets: SLICE_KINDS.includes(kind) ? sliceSeries(table) : axisSeries(table) }
  // A scatter places its points by value, so it has no category row to carry; a pie's categories are
  // its slices, which the rows name rather than the header.
  const labels = kind === 'scatter' ? null : SLICE_KINDS.includes(kind) ? table.rows.map((row) => row[0] ?? '') : table.header.slice(1)
  const config: Record<string, unknown> = {
    type: shape.type,
    data: labels ? { labels, datasets: shape.datasets } : { datasets: shape.datasets },
  }
  const options = keywordOptions(table)
  if (Object.keys(options).length > 0) config.options = options
  return config
}

/** Only a bare title is writable as a keyword cell; anything else in `options` has no table home. */
function readKeywordOptions(value: unknown): { value: Record<string, unknown> } | { ok: false; reason: 'lossy' } {
  if (value === undefined) return { value: {} }
  if (!isRecord(value)) return { ok: false, reason: 'lossy' }
  const { plugins, ...rest } = value
  if (plugins === undefined) return Object.keys(rest).length === 0 ? { value: {} } : { ok: false, reason: 'lossy' }
  if (!isRecord(plugins)) return { ok: false, reason: 'lossy' }
  const { title, ...otherPlugins } = plugins
  if (Object.keys(otherPlugins).length > 0) return { ok: false, reason: 'lossy' }
  if (!isRecord(title) || title.display !== true || typeof title.text !== 'string') return { ok: false, reason: 'lossy' }
  return { value: { ...rest, title: title.text } }
}

export function chartConfigToTable(config: unknown): ChartTableConversion {
  if (!isRecord(config) || typeof config.type !== 'string') return { ok: false, reason: 'not-a-config' }
  const type = config.type.toLowerCase()
  if ((ECHARTS_ONLY_KINDS as readonly string[]).includes(type)) return { ok: false, reason: 'needs-echarts' }
  if (!AXIS_KINDS.includes(type) && !SLICE_KINDS.includes(type) && type !== 'scatter' && type !== 'bubble') return { ok: false, reason: 'unknown-kind' }
  const data = isRecord(config.data) ? config.data : null
  if (!data || !Array.isArray(data.datasets) || data.datasets.length === 0) return { ok: false, reason: 'lossy' }
  const options = readKeywordOptions(config.options)
  if ('reason' in options) return options
  if (type === 'scatter' || type === 'bubble') return scatterToTable(data.datasets, options.value)
  if (SLICE_KINDS.includes(type)) return sliceToTable(data.labels, data.datasets, options.value, type)
  return axisToTable(type, data.labels, data.datasets, options.value)
}

function axisToTable(type: string, labels: unknown, datasets: unknown[], title: Record<string, unknown>): ChartTableConversion {
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) return { ok: false, reason: 'lossy' }
  const rows: string[][] = []
  for (const raw of datasets) {
    if (!isRecord(raw) || typeof raw.label !== 'string' || !isNumberArray(raw.data, labels.length)) return { ok: false, reason: 'lossy' }
    rows.push([raw.label, ...raw.data.map(String)])
  }
  return { ok: true, table: { kind: type, options: title, header: ['', ...labels.map(String)], rows } }
}

/** A pie's value column has no place in a config, so the name a hand-written table gave it is dropped. */
function sliceToTable(labels: unknown, datasets: unknown[], title: Record<string, unknown>, type: string): ChartTableConversion {
  const only = datasets.length === 1 ? datasets[0] : null
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string') || !isRecord(only) || only.label !== undefined) return { ok: false, reason: 'lossy' }
  if (!isNumberArray(only.data, labels.length)) return { ok: false, reason: 'lossy' }
  return { ok: true, table: { kind: type, options: title, header: ['', ''], rows: only.data.map((value, index) => [String(labels[index]), String(value)]) } }
}

function scatterToTable(datasets: unknown[], title: Record<string, unknown>): ChartTableConversion {
  const points: { name: string; x: number; y: number; r?: number; series: string }[] = []
  for (const raw of datasets) {
    if (!isRecord(raw) || !Array.isArray(raw.data)) return { ok: false, reason: 'lossy' }
    const series = raw.label === undefined ? '' : typeof raw.label === 'string' ? raw.label : null
    if (series === null || (series === '' && datasets.length > 1)) return { ok: false, reason: 'lossy' }
    for (const point of raw.data) {
      if (!isRecord(point) || typeof point.x !== 'number' || typeof point.y !== 'number') return { ok: false, reason: 'lossy' }
      if (point.r !== undefined && typeof point.r !== 'number') return { ok: false, reason: 'lossy' }
      points.push({ name: typeof point.name === 'string' ? point.name : '', x: point.x, y: point.y, r: point.r, series })
    }
  }
  const sized = points.some((point) => point.r !== undefined)
  const grouped = points.some((point) => point.series !== '')
  const header = ['', 'x', 'y', ...(sized ? ['size'] : []), ...(grouped ? ['series'] : [])]
  const rows = points.map((point) => [
    point.name,
    String(point.x),
    String(point.y),
    ...(sized ? [String(point.r ?? 0)] : []),
    ...(grouped ? [point.series] : []),
  ])
  return { ok: true, table: { kind: 'scatter', options: title, header, rows } }
}
