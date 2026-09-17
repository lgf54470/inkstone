import { describe, expect, it } from 'vitest'
import { readChartOption } from './chart-option'

const categories = { xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] } }

describe('reading the format own chart option', () => {
  it('reads a bar series against the categories its axis states', () => {
    const chart = readChartOption({
      ...categories,
      series: [{ type: 'bar', name: 'Views', data: [42, 68, 54] }],
    })
    expect(chart?.categories).toEqual(['Mon', 'Tue', 'Wed'])
    expect(chart?.series).toHaveLength(1)
    expect(chart?.series[0]).toMatchObject({ kind: 'bar', values: [42, 68, 54], axis: 0 })
  })

  it('takes the value an object form states, and names a value the axis has no category for', () => {
    const chart = readChartOption({
      ...categories,
      series: [{ type: 'line', data: [{ value: 1 }, 2, 3, 4] }],
    })
    expect(chart?.series[0]?.values).toEqual([1, 2, 3, 4])
    expect(chart?.series[0]?.names).toEqual(['Mon', 'Tue', 'Wed', ''])
  })

  it('reads a scatter as the pairs it states rather than as values on a category axis', () => {
    const chart = readChartOption({
      series: [{ type: 'scatter', data: [[12, 8], { value: [20, 15] }] }],
    })
    expect(chart?.series[0]?.pairs).toEqual([{ x: 12, y: 8 }, { x: 20, y: 15 }])
    expect(chart?.series[0]?.values).toEqual([8, 15])
  })

  it('reads a pie as the slices it names', () => {
    const chart = readChartOption({
      series: [{ type: 'pie', data: [{ name: 'Mon', value: 42 }, { name: 'Tue', value: 68 }] }],
    })
    expect(chart?.series).toHaveLength(1)
    expect(chart?.series[0]).toMatchObject({ kind: 'pie', values: [42, 68], names: ['Mon', 'Tue'] })
  })
})

describe('the scales and colours an option states', () => {
  it('gives a series that names the second value axis its own scale', () => {
    const chart = readChartOption({
      ...categories,
      series: [
        { type: 'bar', data: [1204, 3880, 9140] },
        { type: 'line', yAxisIndex: 1, data: [0, 222, 136] },
      ],
    })
    expect(chart?.series.map((one) => one.axis)).toEqual([0, 1])
  })

  it('reads the colours the option names, ignoring ones that are not colours', () => {
    const chart = readChartOption({
      color: ['#FF9E8A', 7, '#5E7699'],
      series: [{ type: 'bar', data: [1] }],
    })
    expect(chart?.colors).toEqual(['#FF9E8A', '#5E7699'])
  })
})

describe('an option this build cannot draw whole', () => {
  it('refuses a body of values it cannot read, rather than drawing part of one', () => {
    expect(readChartOption(undefined)).toBeNull()
    expect(readChartOption({})).toBeNull()
    expect(readChartOption({ series: [] })).toBeNull()
    expect(readChartOption({ series: [{ type: 'boxplot', data: [1] }] })).toBeNull()
    expect(readChartOption({ series: [{ type: 'bar', data: ['nope'] }] })).toBeNull()
    expect(readChartOption({ series: [{ type: 'bar', data: [] }] })).toBeNull()
    expect(readChartOption({ series: [{ type: 'bar', yAxisIndex: 2, data: [1] }] })).toBeNull()
  })

  it('refuses a pie standing beside another series, which has nowhere to be drawn', () => {
    expect(
      readChartOption({
        series: [
          { type: 'pie', data: [{ name: 'a', value: 1 }] },
          { type: 'bar', data: [1] },
        ],
      }),
    ).toBeNull()
  })
})
