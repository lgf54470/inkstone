import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphNode, GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { previewProbe } from './preview-stub.test-helpers'
import { GRAPH_NEIGHBOUR_LIST_MAX } from './constants'
import { mountGraphCanvas, placeNodes, pressKey, releaseGraphCanvases, type GraphCanvasMount } from './graph-canvas-mount.test-helpers'

/**
 * The badge has always said `3 in, 5 out` and left it there: the count is the only clue that a node is
 * not alone, and a reader holding the keyboard has no way to reach those other notes from it (G-47). The
 * list under the badge is that way — each row is the node's own Enter action, so the list can never
 * promise something the canvas itself does not do.
 */

vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function note(id: string, title: string, inDegree: number, outDegree: number, kind: GraphNode['kind'] = 'note'): GraphNode {
  return {
    id, title, kind,
    degree: inDegree + outDegree, inDegree, outDegree,
    folderId: null, folderPath: null, folderColor: null, tags: [],
  }
}

const SPACING: Record<string, [number, number]> = {
  Alpha: [0, 0], Beta: [-140, 0], Gamma: [140, 0], Ghost: [0, 140], work: [0, -140],
}

const picture: GraphResponse = {
  nodes: [
    note('note-1', 'Alpha', 1, 2),
    note('note-2', 'Beta', 0, 1),
    note('note-3', 'Gamma', 1, 0),
    note('tag:work', 'work', 1, 0, 'tag'),
    note('unresolved:ghost', 'Ghost', 1, 0, 'unresolved'),
  ],
  edges: [
    { source: 'note-2', target: 'note-1' },
    { source: 'note-1', target: 'note-3' },
    { source: 'note-1', target: 'tag:work' },
    { source: 'note-1', target: 'unresolved:ghost' },
  ],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 5, totalEdges: 4, truncated: false, limit: 350 },
}

function mountSelected(): GraphCanvasMount {
  const graph = mountGraphCanvas(picture)
  placeNodes(graph, SPACING)
  pressKey(graph.canvas, 'ArrowRight')
  return graph
}

function disclosure(graph: GraphCanvasMount): HTMLButtonElement {
  const button = [...graph.container.querySelectorAll('button')]
    .find((candidate) => candidate.getAttribute('aria-label') === t('graph.neighbors'))
  if (!button) throw new Error('the badge offers no way to the neighbours')
  return button
}

/** The rows the open list holds, in the order the reader meets them. */
function menuPanel(): HTMLElement {
  const panel = document.querySelector('[role="menu"]')
  if (!panel) throw new Error('the neighbour list never came out')
  return panel as HTMLElement
}

/** A press that goes through React, because a list the test opens by hand still has to render. */
function press(element: HTMLElement): void {
  act(() => { element.click() })
}

function menuRows(): string[] {
  return [...menuPanel().querySelectorAll('button')].map((item) => item.textContent?.trim() ?? '')
}

function pressRow(label: string): void {
  const row = [...menuPanel().querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!row) throw new Error(`the neighbour list holds no row called ${label}`)
  press(row)
}

beforeAll(async () => {
  await initI18n()
  HTMLElement.prototype.setPointerCapture = function capture() {}
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  releaseGraphCanvases()
  vi.clearAllMocks()
  previewProbe.renders = 0
  previewProbe.subscribes = 0
})

describe('the badge that reaches the neighbours (G-47)', () => {
  it('names the notes on each side of the one on screen, and leaves tag memberships out', () => {
    const graph = mountSelected()

    press(disclosure(graph))

    const rows = menuRows()
    // In the order the reader meets them: the links coming in, then the ones going out.
    expect(rows).toEqual([
      t('graph.neighbors_incoming'), 'Beta',
      t('graph.neighbors_outgoing'), 'Gamma', 'Ghost',
    ])
    expect(rows).not.toContain('work')
  })

  it('opens the note a row names, the way the canvas opens the node it holds', () => {
    const graph = mountSelected()
    press(disclosure(graph))

    pressRow('Beta')

    expect(graph.open).toHaveBeenCalledWith('note-2')
  })

})

describe('where a neighbour row goes (G-47)', () => {
  it('moves the picture to a neighbour that is no note to open, instead of pretending one is', () => {
    const graph = mountSelected()
    graph.state.width = 800
    graph.state.height = 600
    graph.state.offsetX = -900
    graph.state.offsetY = -900
    press(disclosure(graph))

    pressRow('Ghost')

    expect(graph.open).not.toHaveBeenCalled()
    const ghost = graph.state.nodes.find((candidate) => candidate.title === 'Ghost')!
    const screenX = ghost.x * graph.state.scale + graph.state.offsetX
    expect(screenX).toBeGreaterThanOrEqual(0)
    expect(screenX).toBeLessThanOrEqual(graph.state.width)
  })

})

describe('a list that says what it left out (G-47)', () => {
  it('says what it left out rather than holding a shorter list than the count promised', () => {
    const many = GRAPH_NEIGHBOUR_LIST_MAX + 6
    const sources = Array.from({ length: many }, (_unused, index) => note(`src-${index}`, `Source ${index}`, 0, 1))
    const centre = note('note-1', 'Alpha', many, 0)
    const graph = mountGraphCanvas({
      nodes: [centre, ...sources],
      edges: sources.map((source) => ({ source: source.id, target: centre.id })),
      meta: { mode: 'global', centerId: null, depth: 1, totalNodes: many + 1, totalEdges: many, truncated: false, limit: 350 },
    })
    placeNodes(graph, { Alpha: [0, 0] })
    pressKey(graph.canvas, 'ArrowRight')

    press(disclosure(graph))

    expect(menuRows().filter((row) => row.startsWith('Source'))).toHaveLength(GRAPH_NEIGHBOUR_LIST_MAX)
    // The row names the number itself: a count only readable from `Source 6` would still be there.
    expect(menuRows()).toContain(t('graph.neighbors_hidden', { hidden: many - GRAPH_NEIGHBOUR_LIST_MAX }))
  })

})

describe('a list a keyboard can hold (G-47)', () => {
  it('keeps the focus inside the list it opened and hands it back when the list goes away', () => {
    const graph = mountSelected()
    const button = disclosure(graph)
    button.focus()

    press(button)

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(menuPanel().contains(document.activeElement)).toBe(true)

    pressKey(document.activeElement as Element, 'Escape')

    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('is a real button, so the list is reachable without a pointer', () => {
    const graph = mountSelected()

    expect(disclosure(graph).tagName).toBe('BUTTON')
  })

  it('offers no way to neighbours when the node on screen has none to reach', () => {
    const graph = mountGraphCanvas({
      nodes: [note('note-1', 'Alpha', 0, 0)],
      edges: [],
      meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 1, totalEdges: 0, truncated: false, limit: 350 },
    })
    placeNodes(graph, { Alpha: [0, 0] })
    pressKey(graph.canvas, 'ArrowRight')

    const name = t('graph.neighbors')
    expect([...graph.container.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === name)).toBe(false)
  })
})
