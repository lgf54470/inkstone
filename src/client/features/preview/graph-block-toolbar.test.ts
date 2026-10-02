import { describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  enhanceGraphBlockToolbarsInRoot,
  executeGraphBlockAction,
} from './graph-block-toolbar'

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
    expect(wrapper.querySelectorAll('.block-tool-btn')).toHaveLength(2)
    expect(root.querySelector('[data-graph-action="zoom-in"]')).toBeNull()
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

  it('tells the reader there is nothing to export when the diagram never drew', () => {
    const root = mount(MERMAID)
    enhanceGraphBlockToolbarsInRoot(root)
    const toast = vi.fn()
    executeGraphBlockAction('export-image', button(root, 'export-image'), toast)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})
