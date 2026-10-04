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
export type ChartTableLoss = 'not-a-config' | 'unknown-kind' | 'needs-echarts' | 'lossy' | 'styled'
export type ChartTableConversion = { ok: true; table: ChartTable } | { ok: false; reason: ChartTableLoss }

const SLICE_KINDS: readonly string[] = ['pie', 'doughnut', 'polarArea']

/**
 * The kind a written name means, in the spelling this family hands to the engine.
 *
 * A keyword arrives lowercased — `:BAR:` and `:Bar:` are the same chart, and the reference syntax says
 * so — while the engine's own name is camelCase (`polarArea`), so the lookup has to fold the note's
 * spelling down and the answer has to come back in the casing chart.js reads. Matching the two directly
 * is what made `:polarArea:` unreachable: the list holds the camelCase name, the comparison held the
 * lowercased one, and no spelling of it was ever in the list.
 */
function chartTableKind(name: string): ChartTableKind | null {
  const written = name.toLowerCase()
  return CHART_TABLE_KINDS.find((entry) => entry.toLowerCase() === written) ?? null
}
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
  const written = table.kind.toLowerCase()
  if ((ECHARTS_ONLY_KINDS as readonly string[]).includes(written)) throw new ChartConfigError('needs-echarts', written)
  const kind = chartTableKind(written)
  if (kind === null) throw new ChartConfigError('unknown-kind', written)
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

/**
 * The config's `options`, written back as the keyword cell's own JSON.
 *
 * The cell carries arbitrary configuration — `keywordOptions` hands everything in it straight to
 * `options` — so the inverse is nearly the identity. The one thing it folds is the title, which the cell
 * writes as a bare string and `keywordOptions` turns into `plugins.title`; a title object with anything
 * beside `display` and `text` is left exactly as it is, because folding it away would be the loss this
 * file refuses everywhere else. Rejecting everything but a title, as this used to, turned `responsive`
 * into a reason a chart could not be written as a table — a key the cell would have carried without
 * complaint, and one every example in the reference docs has.
 */
function readKeywordOptions(value: unknown): { value: Record<string, unknown> } | { ok: false; reason: 'lossy' } {
  if (value === undefined) return { value: {} }
  if (!isRecord(value)) return { ok: false, reason: 'lossy' }
  const { plugins, ...rest } = value
  if (plugins === undefined) return { value: rest }
  if (!isRecord(plugins)) return { ok: false, reason: 'lossy' }
  const { title, ...otherPlugins } = plugins
  if (isRecord(title) && Object.keys(title).length === 2 && title.display === true && typeof title.text === 'string') {
    const folded: Record<string, unknown> = { ...rest, title: title.text }
    if (Object.keys(otherPlugins).length > 0) folded.plugins = otherPlugins
    return { value: folded }
  }
  return { value: { ...rest, plugins } }
}

/**
 * Whether a dataset or a point carries more than the name and the numbers a table row can hold.
 *
 * A table gives a series its label and its values and nothing else: a colour, a border width, a second
 * axis or a `fill` belongs to the dataset rather than to the data, and no cell of the shared syntax has
 * a home for it. Writing such a config as a table would restyle the chart under the author's hands, so
 * the control declines and names what is in the way.
 */
function hasExtraKeys(record: Record<string, unknown>, held: string[]): boolean {
  return Object.keys(record).some((key) => !held.includes(key))
}

export function chartConfigToTable(config: unknown): ChartTableConversion {
  if (!isRecord(config) || typeof config.type !== 'string') return { ok: false, reason: 'not-a-config' }
  const written = config.type.toLowerCase()
  if ((ECHARTS_ONLY_KINDS as readonly string[]).includes(written)) return { ok: false, reason: 'needs-echarts' }
  // `bubble` has no keyword of its own: it is what a scatter table with a size column is drawn as, so a
  // config carrying it still has a table home.
  const kind = chartTableKind(written) ?? (written === 'bubble' ? 'bubble' : null)
  if (kind === null) return { ok: false, reason: 'unknown-kind' }
  const data = isRecord(config.data) ? config.data : null
  if (!data || !Array.isArray(data.datasets) || data.datasets.length === 0) return { ok: false, reason: 'lossy' }
  const options = readKeywordOptions(config.options)
  if ('reason' in options) return options
  if (kind === 'scatter' || kind === 'bubble') return scatterToTable(data.datasets, options.value)
  if (SLICE_KINDS.includes(kind)) return sliceToTable(data.labels, data.datasets, options.value, kind)
  return axisToTable(kind, data.labels, data.datasets, options.value)
}

function axisToTable(type: string, labels: unknown, datasets: unknown[], title: Record<string, unknown>): ChartTableConversion {
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) return { ok: false, reason: 'lossy' }
  const rows: string[][] = []
  for (const raw of datasets) {
    if (!isRecord(raw) || typeof raw.label !== 'string' || !isNumberArray(raw.data, labels.length)) return { ok: false, reason: 'lossy' }
    if (hasExtraKeys(raw, ['label', 'data'])) return { ok: false, reason: 'styled' }
    rows.push([raw.label, ...raw.data.map(String)])
  }
  return { ok: true, table: { kind: type, options: title, header: ['', ...labels.map(String)], rows } }
}

/** A pie's value column has no place in a config, so the name a hand-written table gave it is dropped. */
function sliceToTable(labels: unknown, datasets: unknown[], title: Record<string, unknown>, type: string): ChartTableConversion {
  const only = datasets.length === 1 ? datasets[0] : null
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string') || !isRecord(only) || only.label !== undefined) return { ok: false, reason: 'lossy' }
  if (!isNumberArray(only.data, labels.length)) return { ok: false, reason: 'lossy' }
  if (hasExtraKeys(only, ['data'])) return { ok: false, reason: 'styled' }
  return { ok: true, table: { kind: type, options: title, header: ['', ''], rows: only.data.map((value, index) => [String(labels[index]), String(value)]) } }
}

function scatterToTable(datasets: unknown[], title: Record<string, unknown>): ChartTableConversion {
  const points: { name: string; x: number; y: number; r?: number; series: string }[] = []
  for (const raw of datasets) {
    if (!isRecord(raw) || !Array.isArray(raw.data)) return { ok: false, reason: 'lossy' }
    const series = raw.label === undefined ? '' : typeof raw.label === 'string' ? raw.label : null
    if (series === null || (series === '' && datasets.length > 1)) return { ok: false, reason: 'lossy' }
    if (hasExtraKeys(raw, ['label', 'data'])) return { ok: false, reason: 'styled' }
    for (const point of raw.data) {
      if (!isRecord(point) || typeof point.x !== 'number' || typeof point.y !== 'number') return { ok: false, reason: 'lossy' }
      if (hasExtraKeys(point, ['x', 'y', 'r', 'name'])) return { ok: false, reason: 'styled' }
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
