import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderer'

/**
 * The trip `style=` makes out of a fence's info line and onto the block. The attribute is the only home
 * the stated format has once the markup is committed — the layer that reads a body has the node, not the
 * note's text — so what is pinned here is that the value arrives, under the family's own mark, as
 * written.
 */
const OPTION = "{ title: { text: 'Hi' }, series: [] }"
const TABLE = '| :bar: | A |\n| --- | --- |\n| s | 1 |'

const block = (markdown: string, selector: string): Element | null =>
  new DOMParser().parseFromString(renderMarkdown(markdown).html, 'text/html').querySelector(selector)

describe('the format a chart fence states', () => {
  it('is carried onto an echarts block under its own mark', () => {
    expect(block('```echarts style=table\n' + TABLE, '[data-echarts]')?.getAttribute('data-echarts-style')).toBe('table')
    expect(block('```echarts\n' + OPTION, '[data-echarts]')?.hasAttribute('data-echarts-style')).toBe(false)
  })

  it('carries a value the family does not know as written, so the block can report it', () => {
    expect(block('```echarts style=tabel\n' + OPTION, '[data-echarts]')?.getAttribute('data-echarts-style')).toBe('tabel')
  })

  it('is carried onto a chart block under the chart mark, not the echarts one', () => {
    const stated = block('```chart style=table\n' + TABLE, '[data-chart]')
    expect(stated?.getAttribute('data-chart-style')).toBe('table')
    expect(stated?.hasAttribute('data-echarts-style')).toBe(false)
    expect(block('```chart\n' + OPTION, '[data-chart]')?.hasAttribute('data-chart-style')).toBe(false)
  })

  it('leaves the fence marks a stated format shares its line with alone', () => {
    const asked = block('```echarts js style=table\n' + TABLE, '[data-echarts]')
    expect(asked?.getAttribute('data-echarts-script')).toBe('true')
    expect(asked?.getAttribute('data-echarts-style')).toBe('table')
  })
})
