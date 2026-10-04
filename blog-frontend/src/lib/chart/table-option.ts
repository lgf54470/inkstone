/**
 * A chart table turned into an echarts option: the same `| :kind:{config} | … |` syntax the app reads,
 * and the same option shape, so a post written in the app draws the same picture on the blog.
 *
 * The reverse direction the app has (option → table, for its format control) is not here: a post is
 * published text with no author holding a toggle, and half a converter is dead code.
 */
import { resolveScatterColumns, symbolSize } from './columns.ts'
import { type ChartTable } from './model.ts'
import { DEFAULT_MAP_SOURCE, isAllowedMapSource } from './map-sources.ts'

/** The kinds an echarts fence draws from a table. */
export const ECHARTS_TABLE_KINDS = ['line', 'bar', 'radar', 'pie', 'scatter', 'heatmap', 'sankey', 'map'] as const

/** Kinds only the chart.js fence draws. Lowercased, because a keyword is matched case-insensitively. */
const CHART_ONLY_KINDS: readonly string[] = ['doughnut', 'polararea', 'bubble']

export type EchartsTableReason = 'needs-chart' | 'unknown-kind' | 'empty-table' | 'too-narrow' | 'bad-mapping' | 'map-refused'

export class EchartsTableError extends Error {
  constructor(readonly reason: EchartsTableReason, readonly kind = '') {
    super(reason)
  }
}

export interface EchartsTableOption {
  /** Whatever the library is handed: a table builds a record, an option body may be any object. */
  option: unknown
  /** Set only by `map`: the outline data to register before drawing. */
  mapSource: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function num(cell: string | undefined): number {
  const value = Number.parseFloat(String(cell ?? '').replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}

function requireShape(table: ChartTable, columns = 2): void {
  if (table.header.length < columns) throw new EchartsTableError('too-narrow', table.kind)
  if (table.rows.length === 0) throw new EchartsTableError('empty-table', table.kind)
}

/** The keyword cell's `title`, which every kind draws the same way. */
function titleOf(table: ChartTable): Record<string, unknown> {
  return typeof table.options.title === 'string' && table.options.title.length > 0
    ? { text: table.options.title }
    : {}
}

/** Anything but `title` and the mapping in the keyword cell is passed straight onto the option. */
function extraOf(table: ChartTable): Record<string, unknown> {
  const { title, 'cherry:mapping': _mapping, mapDataSource: _source, ...rest } = table.options
  return rest
}

function categories(table: ChartTable): string[] {
  return table.header.slice(1)
}

function seriesRows(table: ChartTable): { name: string; values: number[] }[] {
  return table.rows.map((row) => ({ name: row[0] ?? '', values: row.slice(1).map(num) }))
}

function axisOption(table: ChartTable, type: 'line' | 'bar'): Record<string, unknown> {
  const series = seriesRows(table)
  return {
    title: titleOf(table),
    tooltip: { trigger: 'axis' },
    legend: { data: series.map((set) => set.name) },
    xAxis: { type: 'category', data: categories(table) },
    yAxis: { type: 'value' },
    // A chart over more categories than a page can label gets a slider, the same threshold the
    // reference uses — below it the axis is legible without one and the slider is just chrome.
    ...(categories(table).length > 7 ? { dataZoom: [{ type: 'inside' }, { type: 'slider' }] } : {}),
    series: series.map((set) => ({ name: set.name, type, data: set.values, ...(type === 'line' ? { smooth: true } : {}) })),
  }
}

function radarOption(table: ChartTable): Record<string, unknown> {
  requireShape(table)
  const series = seriesRows(table)
  const peak = Math.max(1, ...series.flatMap((set) => set.values))
  return {
    title: titleOf(table),
    tooltip: {},
    legend: { data: series.map((set) => set.name) },
    radar: { indicator: categories(table).map((name) => ({ name, max: Math.ceil(peak * 1.2) })) },
    series: [{ type: 'radar', data: series.map((set) => ({ name: set.name, value: set.values, areaStyle: { opacity: 0.1 } })) }],
  }
}

function pieOption(table: ChartTable): Record<string, unknown> {
  requireShape(table)
  return {
    title: titleOf(table),
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: table.rows.map((row) => ({ name: row[0] ?? '', value: num(row[1]) })),
    }],
  }
}

function scatterOption(table: ChartTable): Record<string, unknown> {
  requireShape(table, 3)
  const columns = resolveScatterColumns(table)
  if (!columns) throw new EchartsTableError('bad-mapping', table.kind)
  const sizes = columns.size >= 0 ? table.rows.map((row) => num(row[columns.size])) : []
  const min = sizes.length > 0 ? Math.min(...sizes) : 0
  const max = sizes.length > 0 ? Math.max(...sizes) : 0
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of table.rows) {
    const point: Record<string, unknown> = { value: [num(row[columns.x]), num(row[columns.y])], name: row[0] ?? '' }
    if (columns.size >= 0) point.symbolSize = symbolSize(num(row[columns.size]), min, max)
    const key = columns.series >= 0 ? row[columns.series] ?? '' : ''
    groups.set(key, [...(groups.get(key) ?? []), point])
  }
  return {
    title: titleOf(table),
    tooltip: { trigger: 'item' },
    legend: groups.size > 1 ? { data: [...groups.keys()] } : {},
    xAxis: { type: 'value', name: columns.x > 0 ? table.header[columns.x] : '' },
    yAxis: { type: 'value', name: columns.y > 0 ? table.header[columns.y] : '' },
    series: [...groups].map(([name, data]) => ({ name: name || 'scatter', type: 'scatter', data })),
  }
}

function heatmapOption(table: ChartTable): Record<string, unknown> {
  requireShape(table, 3)
  const cells: [number, number, number][] = []
  for (const [y, row] of table.rows.entries()) {
    for (const [x, cell] of row.slice(1).entries()) cells.push([x, y, num(cell)])
  }
  const values = cells.map((cell) => cell[2])
  return {
    title: titleOf(table),
    tooltip: { position: 'top' },
    xAxis: { type: 'category', data: categories(table), splitArea: { show: true } },
    yAxis: { type: 'category', data: table.rows.map((row) => row[0] ?? ''), splitArea: { show: true } },
    visualMap: {
      min: Math.min(...values),
      max: Math.max(...values),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    },
    series: [{ type: 'heatmap', data: cells, label: { show: true } }],
  }
}

function sankeyOption(table: ChartTable): Record<string, unknown> {
  requireShape(table, 3)
  const nodes = new Set<string>()
  const links: { source: string; target: string; value: number }[] = []
  for (const row of table.rows) {
    const source = String(row[0] ?? '').trim()
    const target = String(row[1] ?? '').trim()
    const value = num(row[2])
    if (!source || !target || value <= 0) continue
    links.push({ source, target, value })
    nodes.add(source)
    nodes.add(target)
  }
  if (links.length === 0) throw new EchartsTableError('empty-table', table.kind)
  return {
    title: titleOf(table),
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey',
      data: [...nodes].map((name) => ({ name })),
      links,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'source', curveness: 0.5 },
    }],
  }
}

/**
 * The outline source a map table asks for. A cell naming anything off the allowlist is refused rather
 * than fetched: the note's author does not get to choose which host a reader's browser contacts.
 */
export function resolveMapSource(table: ChartTable): string {
  const raw = typeof table.options.mapDataSource === 'string' && table.options.mapDataSource.trim() !== ''
    ? table.options.mapDataSource.trim()
    : DEFAULT_MAP_SOURCE
  if (!isAllowedMapSource(raw)) throw new EchartsTableError('map-refused', 'map')
  return raw
}

function mapOption(table: ChartTable): Record<string, unknown> {
  requireShape(table)
  const values = table.rows.map((row) => num(row[1]))
  return {
    title: titleOf(table),
    tooltip: { trigger: 'item' },
    visualMap: { min: Math.min(...values), max: Math.max(...values), left: 'left', top: 'bottom' },
    series: [{
      name: typeof table.options.title === 'string' ? table.options.title : '',
      type: 'map',
      map: 'inkstone-map',
      roam: true,
      data: table.rows.map((row) => ({ name: row[0] ?? '', value: num(row[1]) })),
    }],
  }
}

export function tableToEchartsOption(table: ChartTable): EchartsTableOption {
  const kind = table.kind.toLowerCase()
  if (!(ECHARTS_TABLE_KINDS as readonly string[]).includes(kind)) {
    throw new EchartsTableError(CHART_ONLY_KINDS.includes(kind) ? 'needs-chart' : 'unknown-kind', kind)
  }
  requireShape(table)
  const built = {
    line: () => axisOption(table, 'line'),
    bar: () => axisOption(table, 'bar'),
    radar: () => radarOption(table),
    pie: () => pieOption(table),
    scatter: () => scatterOption(table),
    heatmap: () => heatmapOption(table),
    sankey: () => sankeyOption(table),
    map: () => mapOption(table),
  }[kind]!()
  const option = { ...built, ...extraOf(table) }
  if (kind !== 'map') return { option, mapSource: null }
  return { option, mapSource: resolveMapSource(table) }
}

/**
 * The other direction, for the format control: an option is a table only when it is one this file
 * wrote, or one shaped exactly like it. Anything else — a theme, a second axis, a formatter — has no
 * table form, and the toggle says so instead of quietly redrawing a simpler chart.
 */
export type EchartsOptionTable = { ok: true; table: ChartTable } | { ok: false; reason: 'not-generated' | 'map-refused' }

function asSeries(option: Record<string, unknown>): Record<string, unknown>[] | null {
  return Array.isArray(option.series) && option.series.length > 0
    ? option.series.filter(isRecord) as Record<string, unknown>[]
    : null
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

export function echartsOptionToTable(option: unknown): EchartsOptionTable {
  if (!isRecord(option)) return { ok: false, reason: 'not-generated' }
  const series = asSeries(option)
  if (!series) return { ok: false, reason: 'not-generated' }
  const kind = String(series[0].type ?? '')
  const title = isRecord(option.title) && typeof option.title.text === 'string' ? { title: option.title.text } : {}
  const built = {
    line: () => axisToTable('line', option, series),
    bar: () => axisToTable('bar', option, series),
    radar: () => radarToTable(option, series),
    pie: () => sliceToTable('pie', series, option),
    scatter: () => scatterToTable(option, series),
    heatmap: () => heatmapToTable(option, series),
    sankey: () => sankeyToTable(option, series),
    map: () => mapToTable(series, title),
  }[kind]
  return built ? built() : { ok: false, reason: 'not-generated' }
}

function axisToTable(kind: string, option: Record<string, unknown>, series: Record<string, unknown>[]): EchartsOptionTable {
  const categories = isRecord(option.xAxis) ? stringArray((option.xAxis as Record<string, unknown>).data) : null
  if (!categories) return { ok: false, reason: 'not-generated' }
  const rows: string[][] = []
  for (const set of series) {
    if (typeof set.name !== 'string' || !numberArray(set.data) || (set.data as number[]).length !== categories.length) return { ok: false, reason: 'not-generated' }
    rows.push([set.name, ...(set.data as number[]).map(String)])
  }
  return { ok: true, table: { kind, options: titleOfOption(option), header: ['', ...categories], rows } }
}

function radarToTable(option: Record<string, unknown>, series: Record<string, unknown>[]): EchartsOptionTable {
  const indicators = isRecord(option.radar) ? (option.radar as Record<string, unknown>).indicator : null
  if (!Array.isArray(indicators) || series.length !== 1 || !isRecord(series[0]) || !Array.isArray(series[0].data)) return { ok: false, reason: 'not-generated' }
  const categories = indicators.map((item) => (isRecord(item) ? String(item.name ?? '') : ''))
  const rows: string[][] = []
  for (const entry of series[0].data) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || !numberArray(entry.value) || entry.value.length !== categories.length) return { ok: false, reason: 'not-generated' }
    rows.push([entry.name, ...entry.value.map(String)])
  }
  return { ok: true, table: { kind: 'radar', options: titleOfOption(option), header: ['', ...categories], rows } }
}

function sliceToTable(kind: string, series: Record<string, unknown>[], option: Record<string, unknown>): EchartsOptionTable {
  if (series.length !== 1 || !Array.isArray(series[0].data)) return { ok: false, reason: 'not-generated' }
  const rows: string[][] = []
  for (const entry of series[0].data) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'number') return { ok: false, reason: 'not-generated' }
    rows.push([entry.name, String(entry.value)])
  }
  return { ok: true, table: { kind, options: titleOfOption(option), header: ['', ''], rows } }
}

function scatterToTable(option: Record<string, unknown>, series: Record<string, unknown>[]): EchartsOptionTable {
  const points: { name: string; x: number; y: number; size: number | null; series: string }[] = []
  const grouped = series.length > 1
  for (const set of series) {
    if (!Array.isArray(set.data)) return { ok: false, reason: 'not-generated' }
    for (const point of set.data) {
      if (!isRecord(point) || !numberArray(point.value) || point.value.length !== 2) return { ok: false, reason: 'not-generated' }
      if (point.symbolSize !== undefined && typeof point.symbolSize !== 'number') return { ok: false, reason: 'not-generated' }
      points.push({
        name: typeof point.name === 'string' ? point.name : '',
        x: point.value[0],
        y: point.value[1],
        size: typeof point.symbolSize === 'number' ? point.symbolSize : null,
        series: typeof set.name === 'string' ? set.name : '',
      })
    }
  }
  // Whether the size column exists is a property of the whole set, so it is settled before any row is
  // written: a table whose first row has three cells and whose last has four is not a table.
  const sized = points.some((point) => point.size !== null)
  const header = ['', 'x', 'y', ...(sized ? ['size'] : []), ...(grouped ? ['series'] : [])]
  const rows = points.map((point) => [
    point.name,
    String(point.x),
    String(point.y),
    ...(sized ? [String(point.size ?? 0)] : []),
    ...(grouped ? [point.series] : []),
  ])
  return { ok: true, table: { kind: 'scatter', options: titleOfOption(option), header, rows } }
}

function heatmapToTable(option: Record<string, unknown>, series: Record<string, unknown>[]): EchartsOptionTable {
  const xAxis = isRecord(option.xAxis) ? stringArray((option.xAxis as Record<string, unknown>).data) : null
  const yAxis = isRecord(option.yAxis) ? stringArray((option.yAxis as Record<string, unknown>).data) : null
  if (!xAxis || !yAxis || !Array.isArray(series[0]?.data)) return { ok: false, reason: 'not-generated' }
  const grid: string[][] = yAxis.map((name) => [name, ...xAxis.map(() => '')])
  for (const cell of series[0].data) {
    if (!Array.isArray(cell) || cell.length !== 3 || typeof cell[0] !== 'number' || typeof cell[1] !== 'number') return { ok: false, reason: 'not-generated' }
    const row = grid[cell[1]]
    if (!row || row[cell[0] + 1] === undefined) return { ok: false, reason: 'not-generated' }
    row[cell[0] + 1] = String(cell[2])
  }
  return { ok: true, table: { kind: 'heatmap', options: titleOfOption(option), header: ['', ...xAxis], rows: grid } }
}

function sankeyToTable(option: Record<string, unknown>, series: Record<string, unknown>[]): EchartsOptionTable {
  const links = series[0]?.links
  if (!Array.isArray(links) || links.length === 0) return { ok: false, reason: 'not-generated' }
  const rows: string[][] = []
  for (const link of links) {
    if (!isRecord(link) || typeof link.source !== 'string' || typeof link.target !== 'string' || typeof link.value !== 'number') return { ok: false, reason: 'not-generated' }
    rows.push([link.source, link.target, String(link.value)])
  }
  return { ok: true, table: { kind: 'sankey', options: titleOfOption(option), header: ['', 'target', 'value'], rows } }
}

function mapToTable(series: Record<string, unknown>[], options: Record<string, unknown>): EchartsOptionTable {
  if (!Array.isArray(series[0]?.data)) return { ok: false, reason: 'not-generated' }
  const rows: string[][] = []
  for (const entry of series[0].data) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'number') return { ok: false, reason: 'not-generated' }
    rows.push([entry.name, String(entry.value)])
  }
  return { ok: true, table: { kind: 'map', options, header: ['', ''], rows } }
}

function titleOfOption(option: Record<string, unknown>): Record<string, unknown> {
  return isRecord(option.title) && typeof option.title.text === 'string' ? { title: option.title.text } : {}
}
