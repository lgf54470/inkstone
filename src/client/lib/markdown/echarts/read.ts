/**
 * Reading an ```echarts fence body whichever format it is in, and rewriting it as the other one.
 *
 * The rewrite is what the header's format control does: it never changes what the block draws, only
 * how the note says it. Both directions therefore refuse rather than approximating — an option with a
 * second axis, a formatter or a theme in it has no table form, and a toggle that quietly dropped one
 * would leave the note drawing a different chart than the one the author was looking at.
 */
import { readChartTable, writeChartTable } from '../chart'
import { detectEchartsMode } from './body'
import { EchartsOptionError, parseEchartsOption } from './option'
import { EchartsTableError, echartsOptionToTable, tableToEchartsOption, type EchartsTableOption } from './table-option'

export type EchartsConvertFailure =
  | 'invalid-option'
  | 'table-syntax'
  | 'not-generated'
  | 'map-refused'
  | 'unknown-kind'
  | 'empty-table'
  | 'too-narrow'
  | 'bad-mapping'
  | 'needs-chart'

export type EchartsConversion = { ok: true; body: string; script: boolean } | { ok: false; reason: EchartsConvertFailure }

/** The option a fence means, from a JSON5/JS body or from a table one. */
export function readEchartsBody(raw: string, { allowScript = false } = {}): EchartsTableOption {
  return detectEchartsMode(raw) === 'table'
    ? tableToEchartsOption(readChartTable(raw))
    : { option: parseEchartsOption(raw, { allowScript }), mapSource: null }
}

function failure(err: unknown): EchartsConversion {
  if (err instanceof EchartsTableError) return { ok: false, reason: err.reason }
  if (err instanceof EchartsOptionError) return { ok: false, reason: 'invalid-option' }
  return { ok: false, reason: 'invalid-option' }
}

export function convertEchartsBody(raw: string, { allowScript = false } = {}): EchartsConversion {
  try {
    if (detectEchartsMode(raw) === 'table') {
      return { ok: true, body: JSON.stringify(readEchartsBody(raw).option, null, 2), script: false }
    }
    const converted = echartsOptionToTable(parseEchartsOption(raw, { allowScript }))
    if (!converted.ok) return converted
    return { ok: true, body: writeChartTable(converted.table), script: false }
  }
  catch (err) {
    return failure(err)
  }
}
