import { describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { DEFAULT_PREFERENCES } from './constants'
import {
  arrowHeadPoints,
  buildInitialLayout,
  createCanvasResizer,
  createGraphTicker,
  createThemeObserver,
  drawNodes,
  getConnectedNeighborIds,
  readThemeColors,
} from './canvas-draw'
import type { CanvasState } from './types'

const sampleData: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-3', title: 'Note 3', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [
    { source: 'note-1', target: 'note-2' },
    { source: 'note-3', target: 'note-1' },
  ],
  meta: {
    mode: 'global',
    centerId: null,
    depth: 1,
    totalNodes: 3,
    totalEdges: 2,
    truncated: false,
    limit: 350,
  },
}

function createInitialState(): CanvasState {
  return {
    nodes: [],
    edges: [],
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    viewLeft: 0,
    viewTop: 0,
    dragging: null,
    pointers: new Map(),
    pinch: null, searchHits: null,
    frame: 0,
    raf: 0,
    schedule: null,
  }
}

describe('buildInitialLayout', () => {
  it('initializes layout with frame 0 when reduced motion is not active', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
    })))
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)
    expect(state.nodes).toHaveLength(3)
    expect(state.edges).toHaveLength(2)
    expect(state.frame).toBe(0)
  })

  it('runs initial physics iterations and sets frame to limit when reduced motion is active', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
    })))
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)
    expect(state.nodes).toHaveLength(3)
    expect(state.edges).toHaveLength(2)
    expect(state.frame).toBe(360)
  })

  it('re-pins the nodes the reader pinned in an earlier session (G-07)', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })))
    const state = createInitialState()

    buildInitialLayout(sampleData, { ...DEFAULT_PREFERENCES, pinnedNodeIds: ['note-2'] }, state)

    expect(state.nodes.find((node) => node.id === 'note-2')?.pinned).toBe(true)
    expect(state.nodes.find((node) => node.id === 'note-1')?.pinned).toBeFalsy()
  })
})

describe('theme following', () => {
  it('reads theme colors from document computed style or fallbacks', () => {
    const colors = readThemeColors()
    expect(colors.edge).toBeTruthy()
    expect(colors.node).toBeTruthy()
    expect(colors.accent).toBeTruthy()
    expect(colors.text).toBeTruthy()
    expect(colors.bgBase).toBeTruthy()
  })

  it('updates colorsRef and triggers onUpdate when data-theme changes', async () => {
    const colorsRef = { current: readThemeColors() }
    const onUpdate = vi.fn()
    const observer = createThemeObserver(colorsRef, onUpdate)

    document.documentElement.setAttribute('data-theme', 'dark')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onUpdate).toHaveBeenCalled()
    observer.disconnect()
  })

  it('updates colorsRef and triggers onUpdate when data-accent changes', async () => {
    const colorsRef = { current: readThemeColors() }
    const onUpdate = vi.fn()
    const observer = createThemeObserver(colorsRef, onUpdate)

    document.documentElement.setAttribute('data-accent', 'emerald')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onUpdate).toHaveBeenCalled()
    observer.disconnect()
  })
})

function mockCanvasContext(
  clearRectCalls: Array<[number, number, number, number]>,
  strokeTextCalls: Array<[string, number, number]> = [],
) {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ({
      setTransform: () => {},
      clearRect: (x: number, y: number, w: number, h: number) => { clearRectCalls.push([x, y, w, h]) },
      save: () => {},
      translate: () => {},
      scale: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      strokeText: (text: string, x: number, y: number) => { strokeTextCalls.push([text, x, y]) },
      fillText: () => {},
    }),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

describe('neighbor highlighting and text halo (UI-02, UI-03)', () => {
  it('identifies 1-degree connected neighbors from edges', () => {
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)
    const neighbors1 = getConnectedNeighborIds(state, 'note-1')
    expect(neighbors1.has('note-2')).toBe(true)
    expect(neighbors1.has('note-3')).toBe(true)
    expect(neighbors1.has('note-1')).toBe(false)
    const neighbors2 = getConnectedNeighborIds(state, 'note-2')
    expect(neighbors2.has('note-1')).toBe(true)
    expect(neighbors2.has('note-3')).toBe(false)
    expect(getConnectedNeighborIds(state, null).size).toBe(0)
  })

  it('draws text halo with strokeText before fillText when rendering labels', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const clearRectCalls: Array<[number, number, number, number]> = []
    const strokeTextCalls: Array<[string, number, number]> = []
    const restoreContext = mockCanvasContext(clearRectCalls, strokeTextCalls)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)
    const colors = readThemeColors()
    const prefsRef = { current: { ...DEFAULT_PREFERENCES, labels: true } }
    const hoverRef = { current: null }, selectedIdRef = { current: null }, activeNoteIdRef = { current: null }
    const style = document.createElement('div').style
    createGraphTicker({ state, canvas, ctx, colorsRef: colors, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style })
    state.schedule?.()

    expect(strokeTextCalls.length).toBeGreaterThan(0)
    restoreContext()
  })
})

describe('layout thrashing prevention (PERF-02)', () => {
  it('caches canvas width and height during resize without measuring in tick', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const clearRectCalls: Array<[number, number, number, number]> = []
    const restoreContext = mockCanvasContext(clearRectCalls)
    const canvas = document.createElement('canvas')
    const getBoundingClientRectSpy = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 800, height: 600, top: 18, left: 32, bottom: 618, right: 832, x: 32, y: 18, toJSON: () => {},
    })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const state = createInitialState()
    // The resizer measures as it is built — the observer's first callback is asynchronous, and the
    // pointer paths read the viewport offset it caches — so the explicit call below is the second
    // measurement, and a tick beyond it still measures nothing at all.
    const { resize, observer } = createCanvasResizer(canvas, ctx, state)
    expect(state.width).toBe(800)
    expect(state.height).toBe(600)
    expect(state.viewLeft).toBe(32)
    expect(state.viewTop).toBe(18)
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(1)
    resize()
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(2)
    const colors = readThemeColors()
    const prefsRef = { current: DEFAULT_PREFERENCES }
    const hoverRef = { current: null }, selectedIdRef = { current: null }, activeNoteIdRef = { current: null }
    const style = document.createElement('div').style
    createGraphTicker({ state, canvas, ctx, colorsRef: colors, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style })
    state.schedule?.()
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(2)
    expect(clearRectCalls.length).toBeGreaterThanOrEqual(1)
    expect(clearRectCalls[0]).toEqual([0, 0, 800, 600])
    observer.disconnect()
    restoreContext()
  })
})

const tagData: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'tag:work', title: 'work', kind: 'tag', degree: 2, inDegree: 2, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [
    { source: 'note-1', target: 'tag:work' },
    { source: 'note-2', target: 'tag:work' },
  ],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
}

describe('tag nodes (FEAT-03)', () => {
  it('stamps each tag node with the colour its notes carry, and nothing on the notes', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })))
    const state = createInitialState()
    buildInitialLayout(tagData, DEFAULT_PREFERENCES, state)
    expect(state.nodes.find((node) => node.kind === 'tag')!.tagColor).toBe('#059669')
    expect(state.nodes.find((node) => node.kind === 'note')!.tagColor).toBeNull()
    expect(state.edges).toHaveLength(2)
    expect(state.nodes.find((node) => node.kind === 'tag')!.r).toBeGreaterThan(state.nodes[0]!.r)
  })

  it('draws a tag node under its hash-prefixed name', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })))
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const clearRectCalls: Array<[number, number, number, number]> = []
    const strokeTextCalls: Array<[string, number, number]> = []
    const restoreContext = mockCanvasContext(clearRectCalls, strokeTextCalls)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const state = createInitialState()
    buildInitialLayout(tagData, DEFAULT_PREFERENCES, state)
    const prefsRef = { current: { ...DEFAULT_PREFERENCES, labels: true } }
    const hoverRef = { current: null }, selectedIdRef = { current: null }, activeNoteIdRef = { current: null }
    createGraphTicker({
      state, canvas, ctx, colorsRef: readThemeColors(), prefsRef, hoverRef, selectedIdRef, activeNoteIdRef,
      style: document.createElement('div').style,
    })
    state.schedule?.()

    expect(strokeTextCalls.map((call) => call[0])).toContain('#work')
    restoreContext()
  })
})

const kindData: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'tag:work', title: 'work', kind: 'tag', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'unresolved:ghost', title: 'Ghost', kind: 'unresolved', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [
    { source: 'note-1', target: 'tag:work' },
    { source: 'note-1', target: 'unresolved:ghost' },
  ],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
}

describe('node shape coding (G-30)', () => {
  it('rings a tag node so the three kinds read apart without their colours', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })))
    const state = createInitialState()
    buildInitialLayout(kindData, DEFAULT_PREFERENCES, state)
    const arcs: Array<[number, number, number]> = []
    let strokes = 0
    let fills = 0
    const ctx = {
      beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: (x: number, y: number, r: number) => { arcs.push([x, y, r]) },
      fill: () => { fills++ }, stroke: () => { strokes++ },
      fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D
    drawNodes({
      ctx, state, colors: readThemeColors(), emphasizedId: null, neighborIds: new Set(), groupBy: 'none',
      selectedIdRef: { current: null }, activeNoteIdRef: { current: null },
    })

    const [note, tag] = state.nodes
    expect(arcs).toHaveLength(4)
    expect(arcs.filter(([x, y]) => x === note!.x && y === note!.y)).toHaveLength(1)
    const tagArcs = arcs.filter(([x, y]) => x === tag!.x && y === tag!.y)
    expect(tagArcs).toHaveLength(2)
    expect(tagArcs[1]![2] - tagArcs[0]![2]).toBeCloseTo(2, 6)
    expect(strokes).toBe(2)
    expect(fills).toBe(2)
  })
})

describe('color group rules (FEAT-04)', () => {
  it('stamps each node the layout builds with the colour of the rule it matches', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })))
    const prefs = {
      ...DEFAULT_PREFERENCES,
      colorGroups: [{ id: 'r1', query: 'tag:work', color: '#4f46e5' }],
    }
    const state = createInitialState()
    buildInitialLayout(tagData, prefs, state)
    expect(state.nodes.find((node) => node.id === 'note-1')!.colorGroup).toBe('#4f46e5')
    expect(state.nodes.find((node) => node.kind === 'tag')!.colorGroup).toBeNull()
  })

  it('leaves every node unpainted by rules when no rule matches the response', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: false, media: query })))
    const prefs = {
      ...DEFAULT_PREFERENCES,
      colorGroups: [{ id: 'r1', query: 'tag:none-of-these', color: '#4f46e5' }],
    }
    const state = createInitialState()
    buildInitialLayout(tagData, prefs, state)
    expect(state.nodes.every((node) => node.colorGroup === null)).toBe(true)
  })
})

/**
 * The head a link is drawn with is the one piece of geometry that has to agree between the panel and an
 * exported picture, so its two rules are read off here: the tip stops short of the node it arrives at,
 * and the arms shrink as the reader zooms in so the head keeps the same size on screen.
 */
describe('arrow head geometry', () => {
  function laidOut() {
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)
    return state.nodes
  }

  function armLength(corners: Array<[number, number]>): number {
    const [tip, arm] = corners
    return Math.hypot(arm![0] - tip![0], arm![1] - tip![1])
  }

  it('stops the tip just outside the node the link arrives at', () => {
    const nodes = laidOut()
    const [from, to] = nodes
    const tip = arrowHeadPoints(from!, to!, 1)[0]!
    expect(Math.hypot(tip[0] - to!.x, tip[1] - to!.y)).toBeCloseTo(to!.r + 2, 6)
  })

  it('keeps the head the same size on screen as the reader zooms in', () => {
    const nodes = laidOut()
    const [from, to] = nodes
    expect(armLength(arrowHeadPoints(from!, to!, 4))).toBeCloseTo(armLength(arrowHeadPoints(from!, to!, 1)) / 2)
  })
})

describe('the ticker\'s own contract (G-33)', () => {
  it('is one options object, and a call with nothing else still paints a frame', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const clearRectCalls: Array<[number, number, number, number]> = []
    const restoreContext = mockCanvasContext(clearRectCalls, [])
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const state = createInitialState()
    buildInitialLayout(sampleData, DEFAULT_PREFERENCES, state)

    createGraphTicker({
      state, canvas, ctx, colorsRef: { current: readThemeColors() }, prefsRef: { current: DEFAULT_PREFERENCES },
      hoverRef: { current: null }, selectedIdRef: { current: null }, activeNoteIdRef: { current: null },
      style: document.createElement('div').style,
    })

    // The positional overload nobody called was a second contract to keep in sync with the first.
    expect(createGraphTicker.length).toBe(1)
    state.schedule?.()
    expect(state.schedule).toBeTypeOf('function')
    expect(clearRectCalls.length).toBeGreaterThan(0)
    restoreContext()
  })
})
