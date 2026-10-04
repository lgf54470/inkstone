import { describe, expect, it } from 'vitest'
import { convertEchartsBody, readEchartsBody } from './read'
import { DEFAULT_MAP_SOURCE } from '@shared/map-sources'

const TABLE = '| :bar:{"title": "柱状图"} | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |'

describe('reading an echarts fence body', () => {
  it('takes a table body through the table reader', () => {
    expect(readEchartsBody(TABLE).option).toMatchObject({
      title: { text: '柱状图' },
      series: [{ type: 'bar', name: 's', data: [1, 2] }],
    })
  })

  it('takes an option body through the option reader', () => {
    expect(readEchartsBody('{ series: [{ type: \'funnel\', data: [] }] }').option).toEqual({ series: [{ type: 'funnel', data: [] }] })
    expect(readEchartsBody(TABLE).map).toBeNull()
    expect(readEchartsBody('{ series: [{ type: \'map\', map: \'china\' }] }').map).toEqual({ source: DEFAULT_MAP_SOURCE, name: 'china' })
  })

  it('will not run a function body the surface did not allow', () => {
    const body = '{ series: [{ type: \'line\', data: [1], tooltip: { formatter: (p) => p.value } }] }'
    expect(() => readEchartsBody(body)).toThrow()
    expect(readEchartsBody(body, { allowScript: true })).toBeTruthy()
  })
})

describe('converting an echarts fence body', () => {
  it('writes a table as the option that means the same chart', () => {
    const converted = convertEchartsBody(TABLE)
    expect(converted.ok && JSON.parse(converted.body)).toEqual(readEchartsBody(TABLE).option)
    expect(converted.ok && converted.script).toBe(false)
  })

  it('writes an option back as the table it was built from', () => {
    const option = '{ title: { text: "柱状图" }, xAxis: { type: "category", data: ["A", "B"] }, yAxis: { type: "value" }, series: [{ name: "s", type: "bar", data: [1, 2] }] }'
    const converted = convertEchartsBody(option)
    expect(converted.ok && converted.body).toBe(TABLE.replace('{"title": "柱状图"}', '{"title":"柱状图"}'))
  })

  it('refuses an option a table cannot write, and says which', () => {
    expect(convertEchartsBody('{ series: [{ type: "gauge" }] }')).toEqual({ ok: false, reason: 'not-generated' })
    expect(convertEchartsBody('{ not readable')).toEqual({ ok: false, reason: 'invalid-option' })
    expect(convertEchartsBody('| :heatmap: | a | b |\n| --- | --- | --- |\n| r | 1 | 2 |').ok).toBe(true)
    expect(convertEchartsBody('| :nope: | a |\n| --- | --- |\n| r | 1 |')).toEqual({ ok: false, reason: 'unknown-kind' })
  })
})
