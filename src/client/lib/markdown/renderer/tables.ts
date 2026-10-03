import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { encodeDataValue } from '../data-attr'
import { parseChartKeyword, type ChartKeyword } from '../chart'
import { renderEnv } from './env'
import { escapeAttr } from './util'

/**
 * A table whose first header cell is a chart keyword (`| :bar:{"title": "Tally"} | … |`) draws a chart
 * above itself as well as the table, which is the shape the reference syntax documents. The keyword
 * cell is a directive rather than data, so it is emptied here and the kind and configuration travel on
 * the marker instead — the table underneath keeps every value, and the enhancer reads them from it.
 */
function chartDirective(tokens: Token[], index: number): { keyword: ChartKeyword; cell: Token } | null {
  for (let i = index + 1; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.type === 'table_close') return null
    if (token.type !== 'th_open') continue
    const cell = tokens[i + 1]
    if (cell?.type !== 'inline') return null
    const keyword = parseChartKeyword(cell.content)
    return keyword ? { keyword, cell } : null
  }
  return null
}

function chartMarker(keyword: ChartKeyword): string {
  // The table below carries the same data in accessible form, so the picture asks for nothing.
  return `<div class="table-chart" aria-hidden="true" data-table-chart="${escapeAttr(keyword.kind)}" data-table-chart-config="${escapeAttr(encodeDataValue(JSON.stringify(keyword.options)))}"></div>`
}

export function registerTables(md: MarkdownIt): void {

  md.renderer.rules.table_open = (tokens, index, _options, env) => {
    const line = tokens[index]!.map ? ` data-line="${tokens[index]!.map![0]}"` : ''
    const directive = chartDirective(tokens, index)
    if (!directive) return `<div class="table-wrap"${line}><table>`
    directive.cell.content = ''
    directive.cell.children = []
    renderEnv(env).hasEcharts = true
    return `<div class="table-wrap"${line}>${chartMarker(directive.keyword)}<table>`
  }
  md.renderer.rules.table_close = () => '</table></div>'
  const defaultThOpen = md.renderer.rules.th_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) {
      token.attrSet('align', alignMatch[1]!.toLowerCase())
    }
    return defaultThOpen(tokens, idx, options, env, self)
  }
  const defaultTdOpen = md.renderer.rules.td_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!
    const style = token.attrGet('style')
    const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null
    if (alignMatch) {
      token.attrSet('align', alignMatch[1]!.toLowerCase())
    }
    return defaultTdOpen(tokens, idx, options, env, self)
  }
}
