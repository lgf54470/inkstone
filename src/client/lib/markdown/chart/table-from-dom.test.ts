import { describe, expect, it } from 'vitest'
import { decodeDataValue } from '../data-attr'
import { renderMarkdown } from '../renderer'
import { chartTableFromElement, chartTableText } from './table-from-dom'

function tableOf(markdown: string): { marker: HTMLElement; table: HTMLTableElement } {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return {
    marker: root.querySelector<HTMLElement>('[data-table-chart]')!,
    table: root.querySelector('table')!,
  }
}

const BAR = [
  '| :bar:{"title": "Tally"} | A | B |',
  '| --- | --- | --- |',
  '| s1 | 12 | 19 |',
  '| s2 | 3 | 4 |',
].join('\n')

describe('reading a chart table out of the DOM', () => {
  it('takes the kind and the configuration from the marker and the data from the table', () => {
    const { marker, table } = tableOf(BAR)
    const options: unknown = JSON.parse(decodeDataValue(marker.dataset.tableChartConfig!))
    const model = chartTableFromElement(table, marker.dataset.tableChart!, options as Record<string, unknown>)
    expect(model).toEqual({
      kind: 'bar',
      options: { title: 'Tally' },
      header: ['', 'A', 'B'],
      rows: [['s1', '12', '19'], ['s2', '3', '4']],
    })
  })

  it('reads a cell that inline markup decorated as the text it shows', () => {
    const { table } = tableOf(['| :pie: | v |', '| --- | --- |', '| **x** | 1 |'].join('\n'))
    expect(chartTableFromElement(table, 'pie', {}).rows).toEqual([['x', '1']])
  })

  it('pads a short row rather than dropping it', () => {
    const table = document.createElement('table')
    table.innerHTML = '<thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody><tr><td>s</td><td>1</td></tr></tbody>'
    expect(chartTableFromElement(table, 'bar', {}).rows).toEqual([['s', '1', '']])
  })

  it('signs a table by its cells, not by its markup', () => {
    const first = tableOf(BAR)
    const second = tableOf(BAR)
    expect(chartTableText(first.table)).toBe(chartTableText(second.table))
    const edited = tableOf(BAR.replace('12', '13'))
    expect(chartTableText(edited.table)).not.toBe(chartTableText(first.table))
  })
})
