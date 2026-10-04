import { describe, expect, it } from 'vitest'
import { applyChartFencePatch, chartFenceAt, detectChartMode, resolveChartMode } from './body'

const JSON_BODY = '{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}'
const TABLE = '| :bar: | A |\n| --- | --- |\n| s | 1 |'

function note(open = '```chart'): string {
  return `${open}\n${JSON_BODY}\n\`\`\``
}

describe('a chart fence', () => {
  it('names its format by the body alone', () => {
    expect(detectChartMode(JSON_BODY)).toBe('json')
    expect(detectChartMode(TABLE)).toBe('table')
    expect(detectChartMode('  \n' + TABLE)).toBe('table')
    // A table whose delimiter row is broken is still a table: inference reads the first cell.
    expect(detectChartMode('| :bar: | A |\n| s | 1 |')).toBe('table')
  })

  it('reads the format the note states instead of the one the body implies', () => {
    expect(resolveChartMode(JSON_BODY, null)).toBe('json')
    expect(resolveChartMode(TABLE, null)).toBe('table')
    expect(resolveChartMode(TABLE, 'json')).toBe('json')
    expect(resolveChartMode(JSON_BODY, 'table')).toBe('table')
  })

  it('finds its own fence by the line the block was stamped with', () => {
    expect(chartFenceAt(note(), 0)).toEqual({ line: 0, body: JSON_BODY, info: 'chart' })
    expect(chartFenceAt(note('```chartjs style=table'), 0)).toEqual({ line: 0, body: JSON_BODY, info: 'chartjs style=table' })
    expect(chartFenceAt(note(), 1)).toBeNull()
    expect(chartFenceAt('```js\n1\n```', 0)).toBeNull()
  })

  it('rewrites the body, the stated format, or both in one edit', () => {
    expect(applyChartFencePatch(note(), chartFenceAt(note(), 0)!, { body: TABLE }))
      .toBe('```chart\n' + TABLE + '\n```')
    expect(applyChartFencePatch(note(), chartFenceAt(note(), 0)!, { style: 'json' }))
      .toBe('```chart style=json\n' + JSON_BODY + '\n```')
    expect(applyChartFencePatch(note('```chart style=json'), chartFenceAt(note('```chart style=json'), 0)!, { body: TABLE, style: 'table' }))
      .toBe('```chart style=table\n' + TABLE + '\n```')
  })

  it('keeps a CRLF note that way when it rewrites one', () => {
    const crlf = '```chart style=json\r\n' + JSON_BODY + '\r\n```\r\n'
    const next = applyChartFencePatch(crlf, chartFenceAt(crlf, 0)!, { body: TABLE, style: 'table' })
    expect(next).toBe('```chart style=table\r\n' + TABLE.split('\n').join('\r\n') + '\r\n```\r\n')
  })

  it('restates the format without touching the body', () => {
    expect(applyChartFencePatch(note('```chart style=table'), chartFenceAt(note('```chart style=table'), 0)!, { style: 'json' }))
      .toBe('```chart style=json\n' + JSON_BODY + '\n```')
  })

  it('declines to write when the fence no longer holds the body it was drawn from', () => {
    const fence = chartFenceAt(note(), 0)!
    expect(applyChartFencePatch('```chart\n{"type":"line"}\n```', fence, { style: 'table' })).toBeNull()
  })
})
