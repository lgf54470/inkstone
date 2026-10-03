import { describe, expect, it } from 'vitest'
import { readChartTable, writeChartTable } from '../chart'
import { EchartsTableError, echartsOptionToTable, tableToEchartsOption } from './table-option'

/** The eight examples from the reference page's table-chart section, copied as written. */
const DEMO: Record<string, string> = {
  line: [
    '| :line:{"title": "折线图"} | Header1 | Header2 | Header3 | Header4 |',
    '| ------ | ------ | ------ | ------ | ------ |',
    '| Sample1 | 11 | 11 | 4 | 33 |',
    '| Sample2 | 112 | 111 | 22 | 222 |',
  ].join('\n'),
  bar: [
    '| :bar:{"title": "柱状图"} | Header1 | Header2 |',
    '| ------ | ------ | ------ |',
    '| Sample1 | 11 | 11 |',
  ].join('\n'),
  heatmap: [
    '| :heatmap:{"title": "热力图"} | 周一 | 周二 |',
    '| ------ | ------ | ------ |',
    '| 上午 | 10 | 20 |',
    '| 下午 | 15 | 25 |',
  ].join('\n'),
  pie: [
    '| :pie:{"title": "饼图"} | 数值 |',
    '| ------ | ------ |',
    '| 苹果 | 40 |',
    '| 香蕉 | 30 |',
  ].join('\n'),
  radar: [
    '| :radar:{"title": "雷达图"} | 技能1 | 技能2 |',
    '| ------ | ------ | ------ |',
    '| 用户A | 90 | 85 |',
    '| 用户B | 75 | 90 |',
  ].join('\n'),
  scatter: [
    '| :scatter:{"title": "数据散点图"} | 横坐标 | 纵坐标 | 大小 | 系列 |',
    '| ------ | ------ | ------ | ------ | ------ |',
    '| A1 | 10 | 20 | 5 | 系列一 |',
    '| A2 | 15 | 25 | 10 | 系列一 |',
    '| B1 | 12 | 18 | 8 | 系列二 |',
  ].join('\n'),
  sankey: [
    '| :sankey:{"title": "能源流向图"} | 目标 | 数值 |',
    '| ------ | ------ | ------ |',
    '| 煤炭 | 发电 | 300 |',
    '| 天然气 | 发电 | 200 |',
    '| 发电 | 工业 | 400 |',
  ].join('\n'),
  map: [
    '| :map:{"title": "中国地图"} | 数值 |',
    '| :-: | :-: |',
    '| 北京 | 100 |',
    '| 上海 | 200 |',
  ].join('\n'),
}

function optionOf(body: string): Record<string, unknown> {
  return tableToEchartsOption(readChartTable(body)).option as Record<string, unknown>
}

function seriesOf(option: Record<string, unknown>): Record<string, unknown>[] {
  return option.series as Record<string, unknown>[]
}

describe('a chart table as an echarts option', () => {
  it('puts one series per row on categories read from the header', () => {
    const option = optionOf(DEMO.line)
    expect(seriesOf(option)).toHaveLength(2)
    expect(seriesOf(option)[0]).toMatchObject({ name: 'Sample1', type: 'line', data: [11, 11, 4, 33] })
    expect((option.xAxis as Record<string, unknown>).data).toEqual(['Header1', 'Header2', 'Header3', 'Header4'])
    expect(option.title).toEqual({ text: '折线图' })
    expect(option.dataZoom).toBeUndefined()
  })

  it('gives a chart with more categories than labels a slider', () => {
    const wide = '| :bar: | a | b | c | d | e | f | g | h | i |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| s | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |'
    expect(optionOf(wide).dataZoom).toHaveLength(2)
  })

  it('draws a radar whose spokes are the header and whose ceiling clears the peak', () => {
    const option = optionOf(DEMO.radar)
    const indicators = (option.radar as Record<string, unknown>).indicator as { name: string; max: number }[]
    expect(indicators.map((item) => item.name)).toEqual(['技能1', '技能2'])
    expect(indicators[0].max).toBe(108)
    expect(seriesOf(option)[0].data).toEqual([
      { name: '用户A', value: [90, 85], areaStyle: { opacity: 0.1 } },
      { name: '用户B', value: [75, 90], areaStyle: { opacity: 0.1 } },
    ])
  })

  it('reads a pie from its rows', () => {
    expect(seriesOf(optionOf(DEMO.pie))[0].data).toEqual([{ name: '苹果', value: 40 }, { name: '香蕉', value: 30 }])
  })

  it('flattens a heatmap into [x, y, value] triples with a visual map over them', () => {
    const option = optionOf(DEMO.heatmap)
    expect(seriesOf(option)[0].data).toEqual([[0, 0, 10], [1, 0, 20], [0, 1, 15], [1, 1, 25]])
    expect(option.visualMap).toMatchObject({ min: 10, max: 25 })
    expect((option.yAxis as Record<string, unknown>).data).toEqual(['上午', '下午'])
  })

  it('groups a scatter by its series column and scales the size column into a symbol size', () => {
    const option = optionOf(DEMO.scatter)
    const series = seriesOf(option)
    expect(series.map((set) => set.name)).toEqual(['系列一', '系列二'])
    expect(series[0].data).toEqual([
      { value: [10, 20], name: 'A1', symbolSize: 6 },
      { value: [15, 25], name: 'A2', symbolSize: 28 },
    ])
  })

  it('builds a sankey from source, target and value, and names every node once', () => {
    const option = optionOf(DEMO.sankey)
    expect(seriesOf(option)[0].links).toEqual([
      { source: '煤炭', target: '发电', value: 300 },
      { source: '天然气', target: '发电', value: 200 },
      { source: '发电', target: '工业', value: 400 },
    ])
    expect(seriesOf(option)[0].data).toEqual([{ name: '煤炭' }, { name: '发电' }, { name: '天然气' }, { name: '工业' }])
  })

  it('points a map at the registered outlines and lets the visual map span its values', () => {
    const built = tableToEchartsOption(readChartTable(DEMO.map))
    expect(built.mapSource).toBe('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    expect(seriesOf(built.option as Record<string, unknown>)[0]).toMatchObject({ type: 'map', map: 'inkstone-map', data: [{ name: '北京', value: 100 }, { name: '上海', value: 200 }] })
  })

  it('refuses a map whose source is not on the allowlist', () => {
    const body = '| :map:{"mapDataSource": "http://内网/geo.json"} | 数值 |\n| --- | --- |\n| 北京 | 1 |'
    expect(() => tableToEchartsOption(readChartTable(body))).toThrow(EchartsTableError)
    try {
      tableToEchartsOption(readChartTable(body))
    }
    catch (err) {
      expect((err as EchartsTableError).reason).toBe('map-refused')
    }
  })

  it('tells the author a kind only chart.js draws belongs to the other fence', () => {
    for (const kind of ['doughnut', 'polarArea', 'bubble']) {
      try {
        tableToEchartsOption(readChartTable(`| :${kind}: | a |\n| --- | --- |\n| r | 1 |`))
        expect.unreachable()
      }
      catch (err) {
        expect((err as EchartsTableError).reason).toBe('needs-chart')
      }
    }
    expect(() => tableToEchartsOption(readChartTable('| :nope: | a |\n| --- | --- |\n| r | 1 |'))).toThrow(/unknown-kind/)
  })

  it('passes a keyword configuration that is not a title straight onto the option', () => {
    const option = optionOf('| :bar:{"animation": false} | a |\n| --- | --- |\n| r | 1 |')
    expect(option.animation).toBe(false)
  })
})

describe('an echarts option as a chart table', () => {
  it('writes a bar table that reads back as the same chart', () => {
    const converted = echartsOptionToTable(optionOf(DEMO.bar))
    expect(converted.ok && writeChartTable(converted.table)).toBe([
      '| :bar:{"title":"柱状图"} | Header1 | Header2 |',
      '| --- | --- | --- |',
      '| Sample1 | 11 | 11 |',
    ].join('\n'))
  })

  // A pie's, a map's and a sankey's column headings are prose the option has nowhere to keep, so the
  // table that comes back names them in ASCII. What has to survive is the chart, which is what this
  // asserts: the option re-read from the written table is the option that was written.
  for (const kind of ['line', 'bar', 'radar', 'heatmap', 'pie', 'sankey', 'map']) {
    it(`keeps the ${kind} chart whole across a table round trip`, () => {
      const option = optionOf(DEMO[kind])
      const converted = echartsOptionToTable(option)
      expect(converted.ok).toBe(true)
      if (converted.ok) expect(tableToEchartsOption(converted.table).option).toEqual(option)
    })
  }

  it('writes a scatter size column column as the pixel sizes the option holds', () => {
    const converted = echartsOptionToTable(optionOf(DEMO.scatter))
    expect(converted.ok && converted.table.header).toEqual(['', 'x', 'y', 'size', 'series'])
    expect(converted.ok && converted.table.rows).toEqual([
      ['A1', '10', '20', '6', '系列一'],
      ['A2', '15', '25', '28', '系列一'],
      ['B1', '12', '18', '19', '系列二'],
    ])
  })

  it('refuses an option it did not build', () => {
    expect(echartsOptionToTable({ series: [{ type: 'gauge' }] })).toEqual({ ok: false, reason: 'not-generated' })
    expect(echartsOptionToTable({ series: 'no' })).toEqual({ ok: false, reason: 'not-generated' })
    expect(echartsOptionToTable({ xAxis: { data: [1] }, series: [{ type: 'bar', data: ['x'] }] })).toEqual({ ok: false, reason: 'not-generated' })
    expect(echartsOptionToTable('nope')).toEqual({ ok: false, reason: 'not-generated' })
  })
})
