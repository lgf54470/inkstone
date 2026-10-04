import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './index'
import { chartFenceAsksForScript, chartFenceLanguage, isChartTableBody, readFenceStyle, routeChartFence } from './chart-fences'

/**
 * The chart fences as a post sees them: which route a body takes, and what the server puts in the
 * document for it. The client half — an option becoming a picture — is in `../echarts-fence.test.ts`.
 */

const BAR_TABLE = '| :bar:{"title": "Tally"} | A | B |\n| --- | --- | --- |\n| s1 | 12 | 19 |\n| s2 | 3 | 4 |'
const LOOSE_OPTION = '{\n  series: [{ type: \'bar\', data: [1, 2] }],\n}'
const STRICT_OPTION = '{"type":"line","data":{"labels":["a"],"datasets":[{"data":[1,2]}]}}'

function fence(language: string, body: string, marker = ''): string {
  return renderMarkdown(`\`\`\`${language}${marker}\n${body}\n\`\`\``).html
}

function attr(html: string, name: string): string {
  const match = new RegExp(`data-${name}="([^"]*)"`).exec(html)
  return match?.[1] === undefined ? '' : decodeURIComponent(match[1])
}

describe('routing a chart fence', () => {
  it('knows both families and the chart.js alias', () => {
    expect(chartFenceLanguage('chart')).toBe('chart')
    expect(chartFenceLanguage('chartjs')).toBe('chart')
    expect(chartFenceLanguage('echarts')).toBe('echarts')
    expect(chartFenceLanguage('mermaid')).toBeNull()
  })

  it('reads the stated format and nothing else out of the info line', () => {
    expect(readFenceStyle('echarts style=table')).toBe('table')
    expect(readFenceStyle('chart style="JSON"')).toBe('json')
    expect(readFenceStyle('echarts')).toBeNull()
    expect(readFenceStyle('echarts style=png')).toBeNull()
  })

  it('spots a chart table by the keyword in its first cell', () => {
    expect(isChartTableBody(BAR_TABLE)).toBe(true)
    expect(isChartTableBody(LOOSE_OPTION)).toBe(false)
    expect(isChartTableBody('')).toBe(false)
  })

  it('takes the body shape when the note states no format', () => {
    expect(routeChartFence('chart', STRICT_OPTION, 'chart')).toBe('chart-js')
    expect(routeChartFence('chart', BAR_TABLE, 'chart')).toBe('table')
    expect(routeChartFence('echarts', LOOSE_OPTION, 'echarts')).toBe('echarts-option')
    expect(routeChartFence('echarts', BAR_TABLE, 'echarts')).toBe('table')
  })

  it('lets the stated format pick the reader when the two agree', () => {
    expect(routeChartFence('echarts', LOOSE_OPTION, 'echarts style=json')).toBe('echarts-option')
    expect(routeChartFence('echarts', BAR_TABLE, 'echarts style=table')).toBe('table')
  })

  it('draws nothing when the note says one thing and holds another', () => {
    expect(routeChartFence('echarts', LOOSE_OPTION, 'echarts style=table')).toBe('source')
    expect(routeChartFence('chart', BAR_TABLE, 'chart style=json')).toBe('source')
  })

  it('keeps a body that asks to be evaluated on the source route', () => {
    expect(chartFenceAsksForScript('echarts js')).toBe(true)
    expect(chartFenceAsksForScript('echarts js style=table')).toBe(true)
    expect(chartFenceAsksForScript('echarts json5')).toBe(false)
    expect(routeChartFence('echarts', BAR_TABLE, 'echarts js')).toBe('source')
    expect(routeChartFence('echarts', LOOSE_OPTION, 'echarts js')).toBe('source')
  })
})

describe('rendering a chart fence for a post', () => {
  it('hands an echarts body to the client as text', () => {
    const html = fence('echarts', LOOSE_OPTION)
    expect(html).toContain('class="echarts-block loading"')
    expect(html).toContain('aria-busy="true"')
    expect(attr(html, 'echarts-code')).toBe(LOOSE_OPTION)
  })

  it('keeps the chart.js block exactly as the site already drew it', () => {
    const html = fence('chart', STRICT_OPTION)
    expect(html).toContain('class="chartjs-block loading"')
    expect(attr(html, 'chart')).toBe(STRICT_OPTION)
  })

  it('renders a table body as the table the site already turns into a chart', () => {
    const html = fence('chart', BAR_TABLE)
    expect(html).toContain('data-table-chart="bar"')
    expect(html).toContain('<table')
    expect(html).toContain('Tally')
    expect(html).not.toContain('chartjs-block')
    expect(fence('echarts', BAR_TABLE, ' style=table')).toContain('data-table-chart="bar"')
  })

  it('shows a js body as source and never as something to run', () => {
    const html = fence('echarts', '({ series: [{ type: \'bar\' }] })', ' js')
    expect(html).toContain('data-static-block="1"')
    expect(html).toContain('ECharts')
    expect(html).toContain('JavaScript')
    expect(html).not.toContain('data-echarts-code')
  })

  it('shows the source when the stated format and the body disagree', () => {
    expect(fence('echarts', LOOSE_OPTION, ' style=table')).toContain('data-static-block="1"')
    expect(fence('chart', BAR_TABLE, ' style=json')).toContain('data-static-block="1"')
  })

  it('cannot be closed out of its attribute by a body holding quotes or markup', () => {
    const html = fence('echarts', '{ b: \'<img src=c onerror=alert(1)>\' }')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror=')
    expect(attr(html, 'echarts-code')).toContain('<img src=c onerror=alert(1)>')
  })
})
