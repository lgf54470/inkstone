import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../lib/test-render'
import { PresenterWindow } from './presenter-window'
import { PresenterSlidePreview } from './presenter-slide-preview'
import { stubCanvasContext } from '../../../lib/markdown/enhance.test-helpers'
import type { SlidePlan } from '../slide-pagination'
import type { PresenterSlideState } from './use-presenter-channel'

const SLIDE_STATE: PresenterSlideState = {
  noteTitle: 'Project Architecture',
  slideIndex: 1,
  subPage: 0,
  step: 0,
  steps: 0,
  slideCount: 4,
  pageCount: 1,
  currentSlideSource: '# Core Pillars\n\n- Security\n- Performance',
  nextSlideSource: '# Roadmap\n\nQ4 Deliverables',
  nextStep: 0,
  notes: 'Emphasize zero overhead and deterministic fallbacks.',
  startedAt: Date.now() - 65_000,
}

// A presenter reads the slide the room reads, so a diagram, a formula, a chart or a board has to
// arrive as a picture in this document too. The channel carries markdown and both panes paint
// through `PresenterSlidePreview`, so the enhancement the projector runs belongs there.
// Only the diagram vendor is stubbed — what these cases ask is whether this surface puts its slides
// through the enhancement at all, not what mermaid draws. The rest of the chain runs for real.
const mermaidStub = vi.hoisted(() => ({
  render: vi.fn(async (_id: string, source: string) => ({ svg: `<svg class="stub-diagram"><desc>${source}</desc></svg>` })),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: () => { },
    render: (id: string, source: string) => mermaidStub.render(id, source),
  },
}))

// A map and a whiteboard draw through vendors jsdom cannot run, so those two renderers are replaced
// by a marker that records the options this surface handed them. What the case asks is the channel:
// `snapshot` puts the block through the still renderer, while a channel left unset routes it to its
// fence source, and neither the vendor nor a real snapshot can be exercised here.
const staticDraws = vi.hoisted(() => ({
  mindmap: [] as Array<{ box?: { width: number, height: number }, dark: boolean }>,
  excalidraw: [] as number[],
}))

vi.mock('../../../lib/markdown/mindmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/markdown/mindmap')>()
  return {
    ...actual,
    renderStaticMindmaps: vi.fn((root: HTMLElement, options: { box?: { width: number, height: number }, dark: boolean }) => {
      staticDraws.mindmap.push({ box: options.box, dark: options.dark })
      for (const node of root.querySelectorAll<HTMLElement>('[data-mindmap]')) {
        node.classList.remove('loading')
        node.innerHTML = '<svg class="stub-map"></svg>'
      }
      return Promise.resolve()
    }),
  }
})

vi.mock('../../../lib/markdown/excalidraw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/markdown/excalidraw')>()
  return {
    ...actual,
    renderStaticExcalidraws: vi.fn(async (root: HTMLElement) => {
      const blocks = root.querySelectorAll<HTMLElement>('[data-excalidraw]')
      staticDraws.excalidraw.push(blocks.length)
      for (const node of blocks) {
        node.classList.remove('loading')
        node.innerHTML = '<svg class="stub-board"></svg>'
      }
    }),
  }
})

const DIAGRAM_SLIDE = ['# Flow', '', '```mermaid', 'flowchart LR', '  A --> B', '```', ''].join('\n')
const NEXT_DIAGRAM_SLIDE = ['# Elsewhere', '', '```mermaid', 'flowchart LR', '  A --> C', '```', ''].join('\n')
const FORMULA_SLIDE = 'Energy: $E=mc^2$\n'
const CHART_SLIDE = ['```chart', '{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}', '```', ''].join('\n')
const BOARD_SLIDE = ['```kanban', JSON.stringify({
  title: 'Release plan',
  activeViewId: 'view-board',
  columns: [
    { id: 'title', name: 'Title', type: 'title' },
    { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
  ],
  views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
  items: [{ id: 'i1', title: 'Tag the build', properties: { status: 'todo' } }],
}), '```', ''].join('\n')
const MAP_SLIDE = ['# Topics', '', '```mindmap', '# Roadmap', '## Now', '```', ''].join('\n')
const SCENE_SLIDE = ['# Sketch', '', '```excalidraw', '{"type":"excalidraw","version":2,"elements":[]}', '```', ''].join('\n')

// The enhancement is a chain of dynamic imports, so a case waits for the block it asked about rather
// than for a fixed number of ticks. Running out the rounds leaves the assertion to fail on the block
// that never arrived, which is the defect this item is about.
async function untilDrawn(found: () => boolean): Promise<void> {
  for (let round = 0; round < 150 && !found(); round++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  expect(found(), 'the presenter left its slide in the placeholder state').toBe(true)
}

// jsdom lays nothing out, so the box chart.js would measure from the stylesheet is stubbed here the
// way the enhance suite stubs it: without a box the library never gets past its own sizing.
function stubChartBox(width: number, height: number): () => void {
  const box = (name: 'clientWidth' | 'clientHeight', value: number): (() => void) => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, name)
    Object.defineProperty(Element.prototype, name, {
      configurable: true,
      get(this: Element): number {
        if (this.classList?.contains('chartjs-container')) return value
        return original?.get?.call(this) ?? 0
      },
    })
    return () => Object.defineProperty(Element.prototype, name, original ?? { configurable: true, get: () => 0 })
  }
  const restores = [box('clientWidth', width), box('clientHeight', height)]
  return () => { for (const restore of restores) restore() }
}

describe('PresenterSlidePreview — the blocks it draws', () => {
  it('draws the diagram the slide carries instead of leaving its placeholder', async () => {
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: DIAGRAM_SLIDE }))
    await untilDrawn(() => Boolean(container.querySelector('[data-mermaid] svg.stub-diagram')))
    expect(container.querySelector('desc')?.textContent).toContain('A --> B')
    unmount()
  })

  it('sets the formula the slide carries instead of showing its source', async () => {
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: FORMULA_SLIDE }))
    await untilDrawn(() => Boolean(container.querySelector('.katex')))
    expect(container.querySelector('.katex')?.textContent).toContain('E')
    unmount()
  })
})

describe('PresenterSlidePreview — a chart and a board', () => {
  it('draws the chart on a live canvas instead of the fenced source', async () => {
    const restoreBox = stubChartBox(480, 260)
    const restoreContext = stubCanvasContext()
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: CHART_SLIDE }))
    try {
      await untilDrawn(() => Boolean(container.querySelector('[data-chart] canvas.chartjs-canvas')))
      const block = container.querySelector<HTMLElement>('[data-chart]')
      expect(block?.classList.contains('has-error')).toBe(false)
      expect(block?.dataset.rendered).toBeTruthy()
    }
    finally {
      unmount()
      restoreContext()
      restoreBox()
    }
  })

  it('draws a board as its cards, reading the fence bodies its own markup came from', async () => {
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: BOARD_SLIDE }))
    await untilDrawn(() => Boolean(container.querySelector('[data-kanban] .kanban-snapshot')))
    expect(container.querySelector('.kanban-snapshot')?.textContent).toContain('Tag the build')
    unmount()
  })

  it('keeps reading those bodies when the pane shows one page of a longer slide', async () => {
    // The pane slices the markup to the page the show is on, while the fence bodies belong to the
    // whole slide: a slice that carries its blocks without their bodies draws an empty board.
    const plan: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }, { from: 1, to: 2, top: 400 }], scales: [1, 1] }
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: `Opening line.\n\n${BOARD_SLIDE}`, plan, sub: 1 }))
    await untilDrawn(() => Boolean(container.querySelector('[data-kanban] .kanban-snapshot')))
    expect(container.querySelector('.kanban-snapshot')?.textContent).toContain('Tag the build')
    expect(container.textContent).not.toContain('Opening line.')
    unmount()
  })
})

describe('PresenterSlidePreview — the still-image channels', () => {
  it('hands a map to the snapshot renderer at the size of its own page', async () => {
    document.documentElement.dataset.theme = 'light'
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: MAP_SLIDE }))
    await untilDrawn(() => Boolean(container.querySelector('[data-mindmap] svg.stub-map')))
    const drawn = staticDraws.mindmap.at(-1)
    // The map is fitted to a box rather than to wherever the block happens to sit, and the box it
    // gets is the one this slide is laid out in; the theme it is drawn under is the one on screen.
    expect(drawn?.box?.width).toBe(Number(container.querySelector<HTMLElement>('.mx-auto')?.style.width.replace('px', '')))
    expect(drawn?.dark).toBe(false)
    unmount()
    delete document.documentElement.dataset.theme
  })

  it('hands a whiteboard to the snapshot renderer instead of leaving its scene', async () => {
    const { container, unmount } = renderElement(createElement(PresenterSlidePreview, { source: SCENE_SLIDE }))
    await untilDrawn(() => Boolean(container.querySelector('[data-excalidraw] svg.stub-board')))
    expect(staticDraws.excalidraw.at(-1)).toBe(1)
    unmount()
  })
})

describe('PresenterWindow — both panes run the enhancement', () => {
  it('draws the diagram of the slide the presenter walked on to, not only the first one', async () => {
    const state: PresenterSlideState = {
      ...SLIDE_STATE,
      currentSlideSource: DIAGRAM_SLIDE,
      nextSlideSource: NEXT_DIAGRAM_SLIDE,
    }
    const { container, rerender, unmount } = renderElement(createElement(PresenterWindow, { initialState: state }))
    await untilDrawn(() => Boolean(container.querySelector('[data-mermaid] svg.stub-diagram')))
    // A second slide the channel reports has to be drawn as well: an enhancement that only ever
    // looked at the markup it first met is what this case pins.
    rerender(createElement(PresenterWindow, {
      initialState: { ...state, currentSlideSource: NEXT_DIAGRAM_SLIDE },
    }))
    await untilDrawn(() => [...container.querySelectorAll('[data-mermaid] desc')].some((node) => node.textContent?.includes('A --> C')))
    unmount()
  })

  it('draws a diagram in the next-slide pane as well as the current one', async () => {
    const state: PresenterSlideState = {
      ...SLIDE_STATE,
      currentSlideSource: DIAGRAM_SLIDE,
      nextSlideSource: DIAGRAM_SLIDE,
    }
    const { container, unmount } = renderElement(createElement(PresenterWindow, { initialState: state }))
    await untilDrawn(() => container.querySelectorAll('[data-mermaid] svg.stub-diagram').length >= 2)
    expect(container.querySelectorAll('[data-mermaid] svg.stub-diagram')).toHaveLength(2)
    unmount()
  })
})
