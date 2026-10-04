import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  convertChartFence,
  convertEchartsFence,
  enhanceGraphBlockToolbarsInRoot,
  executeGraphBlockAction,
  graphBlockToolbar,
} from './graph-block-toolbar'
import type { BlockActionContext } from './block-overlay'

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

/** The line a rendered block claims to sit on — what a write looks its fence up by. */
function lineOf(root: HTMLElement, selector: string): number {
  return Number(root.querySelector<HTMLElement>(selector)!.dataset.line)
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
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
    executeGraphBlockAction('toggle-source', trigger, vi.fn())
    expect(panel.hidden).toBe(false)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    executeGraphBlockAction('toggle-source', trigger, vi.fn())
    expect(panel.hidden).toBe(true)
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
  })

  it('rewrites a JSON fence as the table that means the same chart, and says so on the line', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"s","data":[1,2]}]}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    convertChartFence(lineOf(root, '[data-chart]'), note, (next: string) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(edits[0]).toBe('```chart style=table\n| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |\n```')
  })

  it('rewrites a table fence as the JSON that means the same chart', () => {
    const note = '```chart style=table\n| :bar:{"title": "t"} | A |\n| --- | --- |\n| s | 1 |\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    convertChartFence(lineOf(root, '[data-chart]'), note, (next: string) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```chart style=json\n')
    expect(JSON.parse(edits[0].replace('```chart style=json\n', '').replace('\n```', ''))).toEqual({
      type: 'bar',
      data: { labels: ['A'], datasets: [{ label: 's', data: [1] }] },
      options: { plugins: { title: { display: true, text: 't' } } },
    })
  })

  // The control works off the body's shape while the annotation decides which reader draws it. On a
  // note whose two statements disagree that makes the press a repair: it writes the body it holds into
  // the other format and restates `style=` to match, so one click lands on a note that says one thing.
  it('repairs a note that states a format its body is not written in', () => {
    const note = '```chart style=json\n| :bar: | A |\n| --- | --- |\n| s | 1 |\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    expect(root.querySelector<HTMLElement>('[data-graph-action="convert-format"]')!.getAttribute('aria-label'))
      .toBe('Write this chart as JSON')
    const edits: string[] = []
    const toast = vi.fn()
    convertChartFence(lineOf(root, '[data-chart]'), note, (next: string) => edits.push(next), toast)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```chart style=json\n')
    expect(edits[0]).toContain('"type": "bar"')
    expect(toast).not.toHaveBeenCalled()
  })

  it('leaves the note alone and says why when a table cannot hold the chart', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"s","data":[1]}]},"options":{"responsive":false}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertChartFence(lineOf(root, '[data-chart]'), note, (next: string) => edits.push(next), toast)
    expect(edits).toEqual([])
    expect(toast).toHaveBeenCalledWith({ title: 'This chart holds more than a table can carry', tone: 'warning' })
  })

  it('declines to write when the fence no longer sits where the block was drawn', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"s","data":[1]}]}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertChartFence(lineOf(root, '[data-chart]'), 'intro\n' + note + '\nmore', (next: string) => edits.push(next), toast)
    expect(edits).toEqual([])
    expect(toast).toHaveBeenCalledWith({ title: 'This block no longer sits where it was drawn; try again', tone: 'warning' })
  })

  it('rewrites an echarts option fence as the table that means the same chart', () => {
    const note = '```echarts\n{ title: { text: "T" }, xAxis: { type: "category", data: ["A"] }, yAxis: { type: "value" }, series: [{ name: "s", type: "bar", data: [1] }] }\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    expect(root.querySelectorAll('.block-tool-btn')).toHaveLength(3)
    const edits: string[] = []
    convertEchartsFence(lineOf(root, '[data-echarts]'), note, (next: string) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('| :bar:{"title":"T"} | A |')
    expect(edits[0]).toContain('| s | 1 |')
  })

  it('takes the js marker off a fence that converts to a table', () => {
    const note = '```echarts js\n{ xAxis: { type: "category", data: ["A"] }, yAxis: {}, series: [{ name: "s", type: "bar", data: [1] }] }\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertEchartsFence(lineOf(root, '[data-echarts]'), note, (next: string) => edits.push(next), toast)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```echarts style=table\n| :bar:')
    expect(toast).not.toHaveBeenCalled()
  })

  it('restates the format an echarts fence was converted into', () => {
    const note = '```echarts style=table\n| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    convertEchartsFence(lineOf(root, '[data-echarts]'), note, (next: string) => edits.push(next), vi.fn())
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```echarts style=json\n')
    expect(edits[0]).toContain('"series"')
  })

  it('declines to convert an echarts option a table cannot write', () => {
    const note = '```echarts\n{ series: [{ type: "gauge", data: [1] }] }\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const edits: string[] = []
    const toast = vi.fn()
    convertEchartsFence(lineOf(root, '[data-echarts]'), note, (next: string) => edits.push(next), toast)
    expect(edits).toEqual([])
    expect(toast).toHaveBeenCalledWith({ title: 'This option is not one a table can write back out', tone: 'warning' })
  })

/**
 * The button reaches the converter through the shared click route, which picks the converter by what
 * kind of block it is: an echarts block whose press runs the chart.js writer would look for a
 * ` ```chart ` fence at that line and decline, so the control would read as broken.
 */
function context(note: string, editContent: (noteId: string, next: string) => void): BlockActionContext {
  return { content: note, sourceNoteId: 'n1', committedSourceRef: { current: note }, api: { editContent, toast: vi.fn() } }
}

describe('the format button through the click route', () => {
  it('rewrites an echarts block from the press on its own control', () => {
    const note = '```echarts\n{ title: { text: "T" }, xAxis: { type: "category", data: ["A"] }, yAxis: { type: "value" }, series: [{ name: "s", type: "bar", data: [1] }] }\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const editContent = vi.fn()
    const handled = graphBlockToolbar.handle(
      { preventDefault: vi.fn() },
      root.querySelector<HTMLElement>('[data-graph-action="convert-format"]')!,
      context(note, editContent),
    )
    expect(handled).toBe(true)
    expect(editContent).toHaveBeenCalledTimes(1)
    expect(editContent.mock.calls[0][1]).toContain('| :bar:{"title":"T"} | A |')
  })

  it('rewrites a chart block from the press on its own control', () => {
    const note = '```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"label":"s","data":[1]}]}}\n```'
    const root = mount(note)
    enhanceGraphBlockToolbarsInRoot(root)
    const editContent = vi.fn()
    graphBlockToolbar.handle(
      { preventDefault: vi.fn() },
      root.querySelector<HTMLElement>('[data-graph-action="convert-format"]')!,
      context(note, editContent),
    )
    expect(editContent.mock.calls[0][1]).toContain('| :bar: | A |')
  })
})

  it('tells the reader there is nothing to export when the diagram never drew', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const toast = vi.fn()
    executeGraphBlockAction('export-image', button(root, 'export-image'), toast)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
