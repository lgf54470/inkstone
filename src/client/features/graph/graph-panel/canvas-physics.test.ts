import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { buildInitialLayout, createGraphTicker, readThemeColors } from './canvas-draw'
import { DEFAULT_PREFERENCES, PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasNode, CanvasState, GraphTickerOptions } from './types'

/**
 * The force layout is the one part of the panel that runs on its own after the reader stops touching it,
 * so these cases drive the frame source by hand and read three promises: the layout converges and the
 * loop stops asking for frames, a node the reader pinned or is holding never drifts, and the camera is
 * fitted once the graph has spread out rather than on the frame that still holds the starting spiral.
 */

function canvasNode(id: string, x: number, y: number, over: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id, title: id, kind: 'note', degree: 0, inDegree: 0, outDegree: 0,
    folderId: null, folderName: null, folderColor: null, tags: [],
    x, y, vx: 0, vy: 0, r: 6, tagColor: null, colorGroup: null,
    ...over,
  }
}

function createState(nodes: CanvasNode[], edges: Array<{ source: string, target: string }>): CanvasState {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return {
    nodes,
    edges: edges.flatMap((edge) => {
      const a = byId.get(edge.source), b = byId.get(edge.target)
      return a && b ? [{ a, b }] : []
    }),
    scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 0, raf: 0, schedule: null,
  }
}

function trio(): CanvasState {
  const data: GraphResponse = {
    nodes: [
      { id: 'note-1', title: 'Note 1', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
      { id: 'note-2', title: 'Note 2', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
      { id: 'note-3', title: 'Note 3', kind: 'note', degree: 0, inDegree: 0, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
    ],
    edges: [{ source: 'note-1', target: 'note-2' }, { source: 'note-2', target: 'note-3' }],
    meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
  }
  const state = createState([], [])
  buildInitialLayout(data, DEFAULT_PREFERENCES, state)
  return state
}

function stubRepulsionQuery(): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
}

const idleContext = () => new Proxy({}, {
  get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}),
}) as CanvasRenderingContext2D

interface FrameSource {
  pending: number
  step: () => void
  runUntilSettled: () => number
}

/** A frame source the test drives one tick at a time, so a layout that never converges is counted instead of hanging the run. */
function manualFrames(): FrameSource {
  let queue: FrameRequestCallback[] = []
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queue.push(callback); return ++id })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const source: FrameSource = {
    get pending() { return queue.length },
    step() {
      const due = queue
      queue = []
      for (const callback of due) callback(0)
    },
    runUntilSettled() {
      let frames = 0
      while (source.pending && frames < PHYSICS_FRAME_LIMIT + 40) {
        source.step()
        frames++
      }
      return frames
    },
  }
  return source
}

function runPhysics(state: CanvasState, options: Partial<GraphTickerOptions> = {}): FrameSource {
  const frames = manualFrames()
  createGraphTicker({
    state,
    canvas: document.createElement('canvas'),
    ctx: idleContext(),
    colorsRef: { current: readThemeColors() },
    prefsRef: { current: DEFAULT_PREFERENCES },
    hoverRef: { current: null },
    selectedIdRef: { current: null },
    activeNoteIdRef: { current: null },
    style: document.createElement('div').style,
    ...options,
  })
  state.schedule?.()
  return frames
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('physics convergence', () => {
  it('settles the layout and stops asking for frames', () => {
    stubRepulsionQuery()
    const state = trio()
    const frames = runPhysics(state)
    const used = frames.runUntilSettled()

    expect(state.frame).toBe(PHYSICS_FRAME_LIMIT)
    expect(frames.pending).toBe(0)
    expect(used).toBeLessThan(PHYSICS_FRAME_LIMIT)
  })

  it('leaves the picture alone once it has settled, however many times it is redrawn', () => {
    stubRepulsionQuery()
    const state = trio()
    const frames = runPhysics(state)
    frames.runUntilSettled()
    const settled = state.nodes.map((node) => ({ x: node.x, y: node.y }))

    for (let repaint = 0; repaint < 5; repaint++) state.schedule?.()
    frames.step()

    expect(state.nodes.map((node) => ({ x: node.x, y: node.y }))).toEqual(settled)
    expect(frames.pending).toBe(0)
  })

  it('spreads a linked pair out to its rest length instead of freezing it on the spiral, for a reader who asked for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: true, media: 'prefers-reduced-motion: reduce' })))
    const data: GraphResponse = {
      nodes: [
        { id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
        { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
      ],
      edges: [{ source: 'note-1', target: 'note-2' }],
      meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
    }
    const state = createState([], [])
    buildInitialLayout(data, DEFAULT_PREFERENCES, state)

    expect(state.frame).toBe(PHYSICS_FRAME_LIMIT)
    const [first, second] = state.nodes
    expect(Math.hypot(second!.x - first!.x, second!.y - first!.y)).toBeGreaterThan(DEFAULT_PREFERENCES.linkDistance / 2)
  })
})

describe('the range the repulsion reaches', () => {
  it('keeps pushing a node away from a cluster that sits past the old cut-off distance', () => {
    const lone = canvasNode('lone', 0, 0)
    const far = canvasNode('far', 600, 0)
    const state = createState([lone, far], [])

    runPhysics(state).step()

    expect(lone.vx).toBeLessThan(0)
    expect(lone.x).toBeLessThan(0)
  })
})

describe('nodes the reader is responsible for', () => {
  it('leaves a pinned node exactly where it was put while the rest of the graph still moves', () => {
    stubRepulsionQuery()
    const state = trio()
    const pinned = state.nodes[0]!
    const other = state.nodes[1]!
    pinned.pinned = true
    const placed = { x: pinned.x, y: pinned.y }
    const before = { x: other.x, y: other.y }

    runPhysics(state).runUntilSettled()

    expect({ x: pinned.x, y: pinned.y }).toEqual(placed)
    expect({ x: other.x, y: other.y }).not.toEqual(before)
  })

  it('does not move the node the pointer is holding, or drag the camera with it', () => {
    stubRepulsionQuery()
    const state = trio()
    const held = state.nodes[0]!
    const offset = { x: state.offsetX, y: state.offsetY }
    state.dragging = { node: held, startX: 40, startY: 40, ox: offset.x, oy: offset.y, cardPutAway: false }

    const frames = runPhysics(state)
    for (let tick = 0; tick < 10; tick++) frames.step()

    expect(held.x).toBe(0)
    expect(held.y).toBe(0)
    expect(state.offsetX).toBe(offset.x)
    expect(state.offsetY).toBe(offset.y)
  })
})

describe('settling the camera (PERF-06)', () => {
  it('fits once the layout has spread out, and never again', () => {
    stubRepulsionQuery()
    const state = trio()
    const onSettled = vi.fn()
    const frames = runPhysics(state, { onSettled })

    frames.step()
    expect(state.frame).toBe(1)
    expect(onSettled).not.toHaveBeenCalled()

    while (state.frame < 69 && frames.pending) frames.step()
    frames.step()
    expect(state.frame).toBe(70)
    expect(onSettled).toHaveBeenCalledTimes(1)

    frames.runUntilSettled()
    expect(state.frame).toBe(PHYSICS_FRAME_LIMIT)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('still fits a graph that arrives already settled, so reduced motion does not strand the camera', () => {
    stubRepulsionQuery()
    const state = trio()
    state.frame = PHYSICS_FRAME_LIMIT
    const onSettled = vi.fn()

    runPhysics(state, { onSettled }).step()

    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})
