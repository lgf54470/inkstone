// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../markdown/index'
import { initTableCharts, rerenderTableChartsForTheme } from '../table-charts'

/** echarts loads behind a dynamic import and draws on a later tick; poll for the picture. */
async function settle(predicate: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => { setTimeout(resolve, 50) })
  }
  return predicate()
}

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'ink-prose'
  root.innerHTML = renderMarkdown(markdown).html
  document.body.replaceChildren(root)
  return root
}

const BAR = '| :bar:{"title": "Tally"} | A | B |\n| --- | --- | --- |\n| s1 | 12 | 19 |\n| s2 | 3 | 4 |'

describe('drawing a post\'s chart table', () => {
  it('paints the chart the table asked for, above the table', async () => {
    const root = mount(BAR)
    initTableCharts()
    const drawn = await settle(() => Boolean(root.querySelector('.table-chart svg')))
    expect(drawn).toBe(true)
    expect(root.querySelector('.table-chart svg')?.textContent).toContain('Tally')
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('keeps the table when a chart cannot be drawn, rather than showing an error at a reader', async () => {
    const root = mount('| :map:{"mapDataSource": "https://evil.example.com/g.json"} | v |\n| --- | --- |\n| 北京 | 1 |')
    initTableCharts()
    const gone = await settle(() => root.querySelector('.table-chart') === null)
    expect(gone).toBe(true)
    expect(root.querySelector('table')).not.toBeNull()
    expect(root.textContent).toContain('北京')
  })

  it('repaints for the theme it is showing', async () => {
    const root = mount(BAR)
    initTableCharts()
    await settle(() => Boolean(root.querySelector('.table-chart svg')))
    const first = root.querySelector('.table-chart svg')
    document.documentElement.setAttribute('data-theme', 'dark')
    rerenderTableChartsForTheme()
    const repainted = await settle(() => root.querySelector('.table-chart svg') !== first)
    expect(repainted).toBe(true)
    document.documentElement.removeAttribute('data-theme')
  })
})
