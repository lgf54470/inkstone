// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../markdown/index'
import { chartTableFromElement } from './from-dom.ts'
import { tableToEchartsOption } from './table-option.ts'

const BAR = '| :bar:{"title": "T"} | A | B |\n| --- | --- | --- |\n| s1 | 1 | 2 |\n| s2 | 3 | 4 |'

function dom(md: string): Document {
  const doc = new DOMParser().parseFromString(renderMarkdown(md).html, 'text/html')
  return doc
}

describe('a chart table in a post', () => {
  it('draws a marker above the table and consumes the directive cell', () => {
    const doc = dom(BAR)
    const wrap = doc.querySelector('.table-wrap')!
    expect(wrap.querySelector('.table-chart')?.getAttribute('data-table-chart')).toBe('bar')
    expect(wrap.querySelector('table')).not.toBeNull()
    expect(wrap.querySelector('.table-chart')!.compareDocumentPosition(wrap.querySelector('table')!) & 4).toBeTruthy()
    expect(doc.querySelector('thead th')?.textContent).toBe('')
    expect(renderMarkdown(BAR).html).not.toContain(':bar:')
  })

  it('leaves an ordinary table alone', () => {
    expect(renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |').html).not.toContain('table-chart')
  })

  it('reads the values back out of the table it sits above', () => {
    const wrap = dom(BAR).querySelector('.table-wrap')!
    const marker = wrap.querySelector<HTMLElement>('.table-chart')!
    const table = wrap.querySelector('table')! as HTMLTableElement
    const options = JSON.parse(decodeURIComponent(marker.dataset.tableChartConfig!))
    const model = chartTableFromElement(table, marker.dataset.tableChart!, options)
    expect(model.header).toEqual(['', 'A', 'B'])
    expect(model.rows).toEqual([['s1', '1', '2'], ['s2', '3', '4']])
    expect((tableToEchartsOption(model).option as { series: unknown[] }).series).toHaveLength(2)
  })

  it('degrades to the table when a map names a source off the allowlist', () => {
    const wrap = dom('| :map:{"mapDataSource": "https://evil.example.com/g.json"} | v |\n| --- | --- |\n| 北京 | 1 |')
      .querySelector('.table-wrap')!
    const table = wrap.querySelector('table')! as HTMLTableElement
    const marker = wrap.querySelector<HTMLElement>('.table-chart')!
    const options = JSON.parse(decodeURIComponent(marker.dataset.tableChartConfig!))
    expect(() => tableToEchartsOption(chartTableFromElement(table, marker.dataset.tableChart!, options))).toThrow(/map-refused/)
  })
})
