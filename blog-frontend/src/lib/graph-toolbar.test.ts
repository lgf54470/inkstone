// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from './markdown/index'
import { enhanceGraphBlockToolbars, executeGraphBlockAction } from './graph-toolbar'

/**
 * The reading aid every diagram block gets, now that a post can carry an echarts fence too: the block
 * keeps its own source behind the toolbar's disclosure, and the two vector families — mermaid and
 * echarts — are the ones a reader can zoom and take away as markup.
 */

const CHART = '<div class="chartjs-block loading" data-chart="%7B%7D" aria-busy="true"></div>'
const MERMAID = '<div class="mermaid-block loading" data-mermaid="flowchart%20TD" aria-busy="true"></div>'

function mount(body: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'ink-prose'
  root.innerHTML = body
  document.body.replaceChildren(root)
  enhanceGraphBlockToolbars(root)
  return root
}

function echartsFence(option: string): string {
  return renderMarkdown(`\`\`\`echarts\n${option}\n\`\`\``).html
}

function action(root: HTMLElement, name: string): boolean {
  const button = root.querySelector<HTMLElement>(`[data-graph-action="${name}"]`)
  if (!button) return false
  return executeGraphBlockAction(name, button)
}

let clicks: string[] = []

beforeEach(() => {
  document.documentElement.lang = 'en-US'
  clicks = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.download)
  })
  URL.createObjectURL = () => 'blob:probe'
  URL.revokeObjectURL = () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('lang')
  document.body.replaceChildren()
})

describe('a post\'s echarts block in its toolbar', () => {
  it('is wrapped with its own title and carries the option behind the disclosure', () => {
    const root = mount(echartsFence('{ series: [{ type: \'bar\' }] }'))
    const wrapper = root.querySelector<HTMLElement>('[data-graph-block="echarts"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector('.block-head-title')?.textContent).toBe('ECharts chart')
    const panel = wrapper?.querySelector<HTMLElement>('[data-graph-source]')
    expect(panel?.hidden).toBe(true)
    expect(panel?.textContent).toContain("series: [{ type: 'bar' }]")
    expect(action(root, 'toggle-source')).toBe(true)
    expect(wrapper?.querySelector('[data-graph-source]')?.hidden).toBe(false)
  })

  it('can be zoomed and fitted, which a chart.js picture cannot', () => {
    const vector = mount(echartsFence('{ series: [] }'))
    expect(vector.querySelectorAll('[data-graph-action="zoom-in"], [data-graph-action="fit"]')).toHaveLength(2)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    vector.querySelector<HTMLElement>('.echarts-block')?.append(svg)
    expect(action(vector, 'zoom-in')).toBe(true)
    expect(svg.style.transform).toBe('scale(1.5)')
    expect(action(vector, 'fit')).toBe(true)
    expect(svg.style.transform).toBe('')

    const canvas = mount(CHART)
    expect(canvas.querySelectorAll('[data-graph-action="zoom-in"], [data-graph-action="fit"]')).toHaveLength(0)
  })

  it('exports its markup as a file named for the family it came from', () => {
    const root = mount(echartsFence('{ series: [] }'))
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 10 10')
    root.querySelector<HTMLElement>('.echarts-block')?.append(svg)
    expect(action(root, 'export-image')).toBe(true)
    expect(clicks).toEqual(['inkstone-echarts.svg'])

    const mermaid = mount(MERMAID)
    const mSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    mermaid.querySelector<HTMLElement>('.mermaid-block')?.append(mSvg)
    expect(action(mermaid, 'export-image')).toBe(true)
    expect(clicks).toEqual(['inkstone-echarts.svg', 'inkstone-mermaid.svg'])
  })
})
