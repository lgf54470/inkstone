import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphResponse, GraphNode } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { previewProbe } from './preview-stub.test-helpers'
import { mountGraphCanvas, pressKey, releaseGraphCanvases, type GraphCanvasMount } from './graph-canvas-mount.test-helpers'

/**
 * A canvas is a picture to a screen reader unless the panel says otherwise, and every pointer gesture it
 * answers to has a keyboard equivalent. These cases mount the real panel surface, drive it with keys
 * instead of a mouse, and read the end state a reader would hear: the canvas name, the announcement of
 * the node that got selected, the badge drawn for it, and the note opened from it.
 */

vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function node(id: string, title: string, inDegree: number, outDegree: number, kind: GraphNode['kind'] = 'note'): GraphNode {
  return {
    id, title, kind,
    degree: inDegree + outDegree, inDegree, outDegree,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const trio: GraphResponse = {
  nodes: [node('note-1', 'Alpha', 1, 2), node('note-2', 'Beta', 0, 1), node('note-3', 'Gamma', 2, 0)],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 1, truncated: false, limit: 350 },
}

function truncated(): GraphResponse {
  return { ...trio, meta: { ...trio.meta, truncated: true, totalNodes: 9 } }
}

function announcement(title: string, incoming: number, outgoing: number): string {
  return `${title}, ${t('graph.direction_counts', { incoming, outgoing })}`
}

function liveRegion(container: HTMLElement): HTMLElement {
  return container.querySelector('[aria-live="polite"]') as HTMLElement
}

/**
 * Puts the fixture's nodes where the case wants them. The arrow keys read the drawing's own layout
 * (G-23), and the spiral the panel lays a response out on is not a layout a case can reason about —
 * so a case says where its nodes are before it presses a key. Untouched nodes keep the panel's.
 */
function place(graph: GraphCanvasMount, byTitle: Record<string, [number, number]>): void {
  for (const node of graph.state.nodes) {
    const point = byTitle[node.title]
    if (point) { node.x = point[0]; node.y = point[1] }
  }
}

/**
 * Walks the keyboard onto the node placed to the right of the first one: the first press enters at
 * the first node of the response, the second steps right to the neighbour the case placed there.
 */
function walkRightTo(graph: GraphCanvasMount, byTitle: Record<string, [number, number]>): void {
  place(graph, byTitle)
  pressKey(graph.canvas, 'ArrowRight')
  pressKey(graph.canvas, 'ArrowRight')
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  releaseGraphCanvases()
  vi.clearAllMocks()
  // The stub's render budget is per selection, not per file: the cases here move the selection more
  // than once, and a counter left running across them would report their total as one loop.
  previewProbe.renders = 0
  previewProbe.subscribes = 0
  usePinnedWindows.setState({ items: [] })
})

describe('canvas made readable', () => {
  it('names the canvas and puts it in the tab order as an application a reader can drive', () => {
    const graph = mountGraphCanvas(trio)
    expect(graph.canvas.getAttribute('role')).toBe('application')
    expect(graph.canvas.getAttribute('aria-label')).toBe(t('graph.graph_canvas_accessible'))
    expect(graph.canvas.tabIndex).toBe(0)
  })

  it('says the arrow-keyed node out loud, with the links running in and out of it', () => {
    const graph = mountGraphCanvas(trio)
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })

    const live = liveRegion(graph.container)
    expect(live.textContent).toBe(announcement('Beta', 0, 1))
    expect(live.getAttribute('aria-atomic')).toBe('true')
    expect(live.className).toContain('sr-only')
  })

  it('draws the same node the reader hears as a badge on screen', () => {
    const graph = mountGraphCanvas(trio)
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })

    const titled = [...graph.container.querySelectorAll('span')].find((element) => element.textContent === 'Beta')
    expect(titled?.parentElement?.textContent).toBe(`Beta${t('graph.direction_counts', { incoming: 0, outgoing: 1 })}`)
  })
})

describe('arrow keys that move by place (G-23)', () => {
  it('moves the selection the way the arrow points, entering at an end when nothing is selected', () => {
    const graph = mountGraphCanvas(trio)
    place(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })

    pressKey(graph.canvas, 'ArrowRight')
    expect(liveRegion(graph.container).textContent).toContain('Alpha')
    pressKey(graph.canvas, 'ArrowRight')
    expect(liveRegion(graph.container).textContent).toContain('Beta')
    pressKey(graph.canvas, 'ArrowUp')
    expect(liveRegion(graph.container).textContent).toContain('Gamma')
    pressKey(graph.canvas, 'ArrowDown')
    expect(liveRegion(graph.container).textContent).toContain('Alpha')
    // Nothing lies to the left of Alpha (the other two are level with it or to its right), so the
    // selection stays where it is rather than jumping to a node the arrow does not point at.
    pressKey(graph.canvas, 'ArrowLeft')
    expect(liveRegion(graph.container).textContent).toContain('Alpha')
  })

  it('enters at the last node when the first arrow points left', () => {
    const graph = mountGraphCanvas(trio)
    place(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'ArrowLeft')

    expect(liveRegion(graph.container).textContent).toContain('Gamma')
  })

  it('brings the node the arrow reached into the viewport', () => {
    const graph = mountGraphCanvas(trio)
    place(graph, { Alpha: [0, 0], Beta: [2_400, 0], Gamma: [0, -120] })
    // jsdom lays no canvas out, so the resizer leaves the viewport at zero: the case gives the state
    // the box the camera math reads, the way a real mount measures one before any key arrives.
    graph.state.width = 800
    graph.state.height = 600
    pressKey(graph.canvas, 'ArrowRight')
    const before = graph.state.offsetX

    pressKey(graph.canvas, 'ArrowRight')
    const beta = graph.state.nodes.find((node) => node.title === 'Beta')!
    const screenX = beta.x * graph.state.scale + graph.state.offsetX
    expect(graph.state.offsetX).toBeLessThan(before)
    expect(screenX).toBeLessThanOrEqual(graph.state.width)
    expect(screenX).toBeGreaterThanOrEqual(0)
  })
})

describe('what the keyboard reaches from a node', () => {
  it('opens the selected note and leaves the graph when the reader presses Enter', () => {
    const graph = mountGraphCanvas(trio)
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'Enter')

    expect(graph.open).toHaveBeenCalledWith('note-2')
    expect(graph.close).toHaveBeenCalledTimes(1)
  })

  it('creates the note behind a ghost node when the reader presses Enter on it', () => {
    const ghosts: GraphResponse = {
      ...trio,
      nodes: [node('note-1', 'Alpha', 1, 0), node('ghost:Zeta', 'Zeta', 0, 0, 'unresolved')],
    }
    const graph = mountGraphCanvas(ghosts)
    walkRightTo(graph, { Alpha: [0, 0], Zeta: [120, 0] })
    pressKey(graph.canvas, 'Enter')

    expect(graph.create).toHaveBeenCalledWith('Zeta')
    expect(graph.open).not.toHaveBeenCalled()
    expect(graph.close).toHaveBeenCalledTimes(1)
  })

  it('previews the note a reader selected from the keyboard', () => {
    const graph = mountGraphCanvas(trio)
    expect(graph.container.querySelector('[data-preview-card]')).toBeNull()
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })

    expect(graph.container.querySelector('[data-preview-card="Beta"]')).toBeTruthy()
  })

  it('filters the graph by the tag a reader arrow-keyed to, without pretending to open it', () => {
    const tagged: GraphResponse = {
      ...trio,
      nodes: [node('note-1', 'Alpha', 1, 0), node('tag:work', 'work', 1, 0, 'tag')],
    }
    const graph = mountGraphCanvas(tagged)
    walkRightTo(graph, { Alpha: [0, 0], work: [120, 0] })
    pressKey(graph.canvas, 'Enter')

    expect(graph.filterByTag).not.toHaveBeenCalled()
    expect(graph.open).not.toHaveBeenCalled()
    expect(graph.close).not.toHaveBeenCalled()
  })
})

describe('keys the canvas keeps for itself', () => {
  it('takes space, the zoom keys and Home so the page behind the graph does not move', () => {
    const graph = mountGraphCanvas(trio)
    expect(pressKey(graph.canvas, ' ').defaultPrevented).toBe(true)

    const zoomed = graph.state.scale
    expect(pressKey(graph.canvas, '+').defaultPrevented).toBe(true)
    expect(graph.state.scale).toBeCloseTo(zoomed + 0.2)
    expect(pressKey(graph.canvas, '-').defaultPrevented).toBe(true)
    expect(graph.state.scale).toBeCloseTo(zoomed)

    const spread = graph.state.nodes.map((item) => ({ id: item.id, x: item.x, y: item.y }))
    expect(pressKey(graph.canvas, 'Home').defaultPrevented).toBe(true)
    expect(graph.state.nodes.map((item) => ({ id: item.id, x: item.x, y: item.y }))).toEqual(spread)
  })

  it('tells the reader how to drive the graph, in the language the app is showing', () => {
    const graph = mountGraphCanvas(trio)
    expect(graph.container.textContent).toContain(t('graph.interaction_hint'))
  })
})

describe('the node actions menu without a pointer (G-22)', () => {
  it('opens the menu for the selected node with the dedicated menu key', () => {
    const graph = mountGraphCanvas(trio)
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'ContextMenu')

    const menu = document.body.querySelector('[role="menu"]')
    expect(menu?.getAttribute('aria-label')).toBe(t('graph.node_actions'))
    expect(menu?.textContent).toContain(t('graph.open_note'))
  })

  it('opens the same menu with Shift+F10 for keyboards without a menu key', () => {
    const graph = mountGraphCanvas(trio)
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'F10', { shiftKey: true })

    expect(document.body.querySelector('[role="menu"]')).toBeTruthy()
  })

  it('leaves the menu closed when no node is selected', () => {
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ContextMenu')

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('promises the menu key in the canvas name a reader hears', () => {
    const graph = mountGraphCanvas(trio)
    expect(graph.canvas.getAttribute('aria-label')).toContain(t('graph.graph_canvas_accessible'))
    expect(t('graph.graph_canvas_accessible')).toContain('Shift+F10')
  })
})

describe('the state a reader is left in', () => {
  it('announces that the graph is only part of what matched', () => {
    const graph = mountGraphCanvas(truncated())
    expect(graph.container.querySelector('[role="status"]')?.textContent)
      .toBe(t('graph.showing_limit', { shown: 3, total: 9 }))
    expect(t('graph.showing_limit', { shown: 3, total: 9 })).toContain('nodes')
  })
})
