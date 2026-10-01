import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphResponse, GraphNode } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { mountGraphCanvas, pressKey, releaseGraphCanvases } from './graph-canvas-mount.test-helpers'

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
    pressKey(graph.canvas, 'ArrowRight')

    const live = liveRegion(graph.container)
    expect(live.textContent).toBe(announcement('Beta', 0, 1))
    expect(live.getAttribute('aria-atomic')).toBe('true')
    expect(live.className).toContain('sr-only')
  })

  it('draws the same node the reader hears as a badge on screen', () => {
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')

    const titled = [...graph.container.querySelectorAll('span')].find((element) => element.textContent === 'Beta')
    expect(titled?.parentElement?.textContent).toBe(`Beta${t('graph.direction_counts', { incoming: 0, outgoing: 1 })}`)
  })

  it('walks the whole graph with the arrow keys and wraps at the end', () => {
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')
    expect(liveRegion(graph.container).textContent).toContain('Beta')
    pressKey(graph.canvas, 'ArrowRight')
    expect(liveRegion(graph.container).textContent).toContain('Gamma')
    pressKey(graph.canvas, 'ArrowLeft')
    expect(liveRegion(graph.container).textContent).toContain('Beta')
    pressKey(graph.canvas, 'ArrowLeft')
    expect(liveRegion(graph.container).textContent).toContain('Alpha')
  })
})

describe('what the keyboard reaches from a node', () => {
  it('opens the selected note and leaves the graph when the reader presses Enter', () => {
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')
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
    pressKey(graph.canvas, 'ArrowRight')
    pressKey(graph.canvas, 'Enter')

    expect(graph.create).toHaveBeenCalledWith('Zeta')
    expect(graph.open).not.toHaveBeenCalled()
    expect(graph.close).toHaveBeenCalledTimes(1)
  })

  it('previews the note a reader selected from the keyboard', () => {
    const graph = mountGraphCanvas(trio)
    expect(graph.container.querySelector('[data-preview-card]')).toBeNull()
    pressKey(graph.canvas, 'ArrowRight')

    expect(graph.container.querySelector('[data-preview-card="Beta"]')).toBeTruthy()
  })

  it('filters the graph by the tag a reader arrow-keyed to, without pretending to open it', () => {
    const tagged: GraphResponse = {
      ...trio,
      nodes: [node('note-1', 'Alpha', 1, 0), node('tag:work', 'work', 1, 0, 'tag')],
    }
    const graph = mountGraphCanvas(tagged)
    pressKey(graph.canvas, 'ArrowRight')
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
    pressKey(graph.canvas, 'ArrowRight')
    pressKey(graph.canvas, 'ContextMenu')

    const menu = document.body.querySelector('[role="menu"]')
    expect(menu?.getAttribute('aria-label')).toBe(t('graph.node_actions'))
    expect(menu?.textContent).toContain(t('graph.open_note'))
  })

  it('opens the same menu with Shift+F10 for keyboards without a menu key', () => {
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')
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
