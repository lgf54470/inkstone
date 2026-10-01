import { createElement, type ReactNode, type RefObject } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphNode } from '@shared/types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { buildInitialLayout } from './canvas-draw'
import { useDynamicGraphPrefs } from './canvas-hooks'
import { DEFAULT_PREFERENCES, PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasNode, CanvasState } from './types'

/**
 * Forces are what a reader tunes against a graph that is already on screen, so changing one has to restart
 * the animation on the nodes that are already there — while a preference that only changes how the picture
 * looks must leave that animation alone. These cases drive the same hook the canvas uses, on a settled
 * layout whose third node the reader has dragged somewhere the physics never put it.
 */

function note(id: string, title: string, outDegree: number): GraphNode {
  return {
    id, title, kind: 'note',
    degree: outDegree, inDegree: 0, outDegree,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const data = {
  nodes: [note('note-1', 'Alpha', 1), note('note-2', 'Beta', 1), note('note-3', 'Gamma', 0)],
  edges: [{ source: 'note-1', target: 'note-2' }, { source: 'note-2', target: 'note-3' }],
  meta: { mode: 'global' as const, centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
}

const DRAGGED = { x: 420, y: -260 }

interface SettledGraph {
  state: CanvasState
  nodes: CanvasNode[]
  dragged: CanvasNode
  schedule: ReturnType<typeof vi.fn>
  update: (prefs: GraphPreferences) => void
}

const mounted: RenderedElement[] = []

function settledLayout(prefs: GraphPreferences): SettledGraph {
  const state: CanvasState = {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, frame: 0, raf: 0, schedule: null,
  }
  buildInitialLayout(data, prefs, state)
  const schedule = vi.fn()
  state.schedule = schedule
  // The canvas hands the hook one ref for the life of the panel; a fresh object per render would itself
  // look like a changed preference.
  const stateRef: RefObject<CanvasState> = { current: state }

  const element = (next: GraphPreferences): ReactNode => createElement(Driver, { stateRef, prefs: next })
  const rendered = renderElement(element(prefs))
  mounted.push(rendered)

  // The mount already anneals once; a reader tunes the forces after the picture has come to rest.
  state.frame = PHYSICS_FRAME_LIMIT
  const dragged = state.nodes[2]!
  dragged.x = DRAGGED.x
  dragged.y = DRAGGED.y
  return { state, nodes: state.nodes, dragged, schedule, update: (next) => { rendered.rerender(element(next)); } }
}

function Driver({ stateRef, prefs }: { stateRef: RefObject<CanvasState>, prefs: GraphPreferences }): null {
  useDynamicGraphPrefs(stateRef, prefs)
  return null
}

beforeAll(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('live graph preferences (PERF-01)', () => {
  it('restarts the animation on the nodes already on screen when the reader pushes the repulsion', () => {
    const graph = settledLayout(DEFAULT_PREFERENCES)
    graph.schedule.mockClear()

    graph.update({ ...DEFAULT_PREFERENCES, repulsion: 1500 })

    expect(graph.state.frame).toBe(PHYSICS_FRAME_LIMIT - 90)
    expect(graph.state.nodes).toBe(graph.nodes)
    expect(graph.dragged.x).toBe(DRAGGED.x)
    expect(graph.dragged.y).toBe(DRAGGED.y)
    expect(graph.schedule).toHaveBeenCalled()
  })

  it('restarts it for the link distance too, and no further back than the annealing window', () => {
    const graph = settledLayout(DEFAULT_PREFERENCES)

    graph.update({ ...DEFAULT_PREFERENCES, linkDistance: 120 })
    expect(graph.state.frame).toBe(PHYSICS_FRAME_LIMIT - 90)

    graph.update({ ...DEFAULT_PREFERENCES, linkDistance: 90 })
    expect(graph.state.frame).toBe(PHYSICS_FRAME_LIMIT - 90)
    expect(graph.state.nodes).toBe(graph.nodes)
  })

  it('sizes the nodes where they stand, without starting a new simulation', () => {
    const graph = settledLayout(DEFAULT_PREFERENCES)
    const radii = graph.nodes.map((node) => node.r)

    graph.update({ ...DEFAULT_PREFERENCES, nodeScale: 1.5 })

    expect(graph.state.nodes).toBe(graph.nodes)
    expect(graph.dragged.x).toBe(DRAGGED.x)
    graph.nodes.forEach((node, index) => { expect(node.r).toBeCloseTo(radii[index]! * 1.5, 10) })
    expect(graph.state.frame).toBe(PHYSICS_FRAME_LIMIT)
  })

  it('leaves the animation alone for the preferences that only change how the graph is drawn', () => {
    const graph = settledLayout(DEFAULT_PREFERENCES)
    graph.schedule.mockClear()

    graph.update({ ...DEFAULT_PREFERENCES, arrows: false, labels: false, groupBy: 'tag' })

    expect(graph.state.frame).toBe(PHYSICS_FRAME_LIMIT)
    expect(graph.state.nodes).toBe(graph.nodes)
    expect(graph.schedule).toHaveBeenCalled()
  })
})
