import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  convertChartFormat,
  enhanceGraphBlockToolbarsInRoot,
  executeGraphBlockAction,
} from './graph-block-toolbar'

beforeAll(async () => {
  await initI18n()
})

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return root
}

function button(root: HTMLElement, action: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(`[data-graph-action="${action}"]`)!
}

const MERMAID = '```mermaid\nflowchart TD\nA-->B\n```'
const CHART = '```chart\n{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}\n```'

describe('enhanceGraphBlockToolbarsInRoot', () => {
  it('wraps a diagram with a head, its tools and the fence source', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const wrapper = root.querySelector<HTMLElement>('.graph-block')!
    expect(wrapper.dataset.graphBlock).toBe('mermaid')
    expect(wrapper.querySelector('.block-head')).not.toBeNull()
    expect(wrapper.querySelectorAll('.block-tool-btn')).toHaveLength(5)
    const source = wrapper.querySelector<HTMLElement>('[data-graph-source]')!
    expect(source.hidden).toBe(true)
    expect(source.textContent).toContain('flowchart TD')
  })

  it('offers no zoom on a canvas chart, which is sized by its container', () => {
    const root = mount(CHART)
    enhanceGraphBlockToolbarsInRoot(root)
    const wrapper = root.querySelector<HTMLElement>('.graph-block')!
    expect(wrapper.dataset.graphBlock).toBe('chart')
    expect(wrapper.querySelectorAll('.block-tool-btn')).toHaveLength(3)
    expect(root.querySelector('[data-graph-action="zoom-in"]')).toBeNull()
    expect(root.querySelector('[data-graph-action="convert-format"]')).not.toBeNull()
  })

  it('offers no format control to a diagram, whose body is not a chart', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    expect(root.querySelector('[data-graph-action="convert-format"]')).toBeNull()
  })

  it('does not wrap a block twice', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    enhanceGraphBlockToolbarsInRoot(root)
    expect(root.querySelectorAll('.graph-block')).toHaveLength(1)
    expect(root.querySelectorAll('.block-head')).toHaveLength(1)
  })

  it('leaves a diagram inside a note embed alone', () => {
    const root = mount(MERMAID)
    const embed = document.createElement('div')
    embed.className = 'note-embed-body'
    embed.append(...root.childNodes)
    root.append(embed)
    enhanceGraphBlockToolbarsInRoot(root)
    expect(root.querySelector('.graph-block')).toBeNull()
  })
})

describe('executeGraphBlockAction', () => {
  it('zooms the diagram and fits it back', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    root.querySelector('.mermaid-block')!.append(svg)
    const wrapper = root.querySelector<HTMLElement>('.graph-block')!

    executeGraphBlockAction('zoom-in', button(root, 'zoom-in'), vi.fn())
    expect(svg.style.transform).toBe('scale(1.5)')
    expect(wrapper.dataset.graphZoom).toBe('1.5')
    expect(wrapper.dataset.graphZoomed).toBe('true')

    executeGraphBlockAction('fit', button(root, 'fit'), vi.fn())
    expect(svg.style.transform).toBe('')
    expect(wrapper.dataset.graphZoom).toBeUndefined()
    expect(wrapper.dataset.graphZoomed).toBe('false')
  })

  it('walks the zoom ladder down from its smallest step no further', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    root.querySelector('.mermaid-block')!.append(svg)
    const wrapper = root.querySelector<HTMLElement>('.graph-block')!
    for (let step = 0; step < 8; step++) executeGraphBlockAction('zoom-out', button(root, 'zoom-out'), vi.fn())
    expect(wrapper.dataset.graphZoom).toBe('0.5')
  })

  it('toggles the source panel and says so on the trigger', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const trigger = button(root, 'toggle-source')
    const panel = root.querySelector<HTMLElement>('[data-graph-source]')!
    executeGraphBlockAction('toggle-source', trigger, vi.fn())
    expect(panel.hidden).toBe(false)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    executeGraphBlockAction('toggle-source', trigger, vi.fn())
    expect(panel.hidden).toBe(true)
  })

  it('rewrites a JSON fence as the table that means the same chart', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"s","data":[1,2]}]}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    convertChartFormat(root.querySelector('[data-chart]')!, note, (next) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(edits[0]).toBe('```chart\n| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |\n```')
  })

  it('rewrites a table fence as the JSON that means the same chart', () => {
    const note = '```chart\n| :bar:{"title": "t"} | A |\n| --- | --- |\n| s | 1 |\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    convertChartFormat(root.querySelector('[data-chart]')!, note, (next) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(JSON.parse(edits[0].replace('```chart\n', '').replace('\n```', ''))).toEqual({
      type: 'bar',
      data: { labels: ['A'], datasets: [{ label: 's', data: [1] }] },
      options: { plugins: { title: { display: true, text: 't' } } },
    })
  })

  it('leaves the note alone and says why when a table cannot hold the chart', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"s","data":[1]}]},"options":{"responsive":false}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertChartFormat(root.querySelector('[data-chart]')!, note, (next) => edits.push(next), toast)
    expect(edits).toEqual([])
    expect(toast).toHaveBeenCalledWith({ title: 'This chart holds more than a table can carry', tone: 'warning' })
  })

  it('declines to write when the fence no longer sits where the block was drawn', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"s","data":[1]}]}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertChartFormat(root.querySelector('[data-chart]')!, 'intro\n' + note + '\nmore', (next) => edits.push(next), toast)
    expect(edits).toEqual([])
    expect(toast).toHaveBeenCalledWith({ title: 'This block no longer sits where it was drawn; try again', tone: 'warning' })
  })

  it('tells the reader there is nothing to export when the diagram never drew', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const toast = vi.fn()
    executeGraphBlockAction('export-image', button(root, 'export-image'), toast)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
