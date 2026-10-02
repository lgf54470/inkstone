import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { buildInitialLayout, drawEdges, drawLabels, drawNodes } from './canvas-draw'
import { mountGraphCanvas, releaseGraphCanvases } from './graph-canvas-mount.test-helpers'
import {
  DEFAULT_PREFERENCES,
  GRAPH_EDGE_ALPHA,
  GRAPH_LABEL_ALPHA,
  GRAPH_SEARCH_DIM_ALPHA,
  GRAPH_SEARCH_DIM_EDGE_ALPHA,
} from './constants'
import type { CanvasState, ThemeColors } from './types'

/**
 * A search that locates its matches leaves the rest of the graph on screen, drawn fainter (G-14). The
 * dimming is a property of the frame, not of the response, so these cases paint the same layout twice —
 * once with no search on the canvas, once with a hit set — and read the alpha each thing was drawn with.
 */

const data: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Reading list', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Quarterly review', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-3', title: 'Archive', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }, { source: 'note-2', target: 'note-3' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
}

const colors: ThemeColors = {
  bgBase: '#ffffff', text: '#222222', edge: '#888888', node: '#666666', accent: '#4f46e5',
  tagPalette: Array.from({ length: 10 }, (_, index) => `#00000${index}`),
}

function recordingContext(): { alphas: number[], ctx: CanvasRenderingContext2D } {
  const alphas: number[] = []
  const record = () => { alphas.push(painted.globalAlpha) }
  const painted = {
    globalAlpha: 1,
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'center' as const,
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: record,
    fill: record,
    strokeText: () => {},
    fillText: record,
  }
  return { alphas, ctx: painted as unknown as CanvasRenderingContext2D }
}

function layout(searchHits?: ReadonlySet<string> | null): CanvasState {
  const state: CanvasState = {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 0, raf: 0, schedule: null,
  }
  buildInitialLayout(data, DEFAULT_PREFERENCES, state)
  state.searchHits = searchHits ?? null
  return state
}

function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
}

function nodeAlphas(state: CanvasState, emphasizedId: string | null = null, neighborIds: Set<string> = new Set()): number[] {
  const paint = recordingContext()
  drawNodes({
    ctx: paint.ctx, state, colors, emphasizedId, neighborIds,
    groupBy: 'none', selectedIdRef: { current: null }, activeNoteIdRef: { current: null },
  })
  return paint.alphas
}

function edgeAlphas(state: CanvasState): number[] {
  const paint = recordingContext()
  drawEdges({ ctx: paint.ctx, state, colors, emphasizedId: null, arrows: false })
  return paint.alphas
}

function labelAlphas(state: CanvasState): number[] {
  const paint = recordingContext()
  drawLabels({
    ctx: paint.ctx, state, colors, emphasizedId: null, neighborIds: new Set(),
    fontFamily: 'sans-serif', scale: 1, labels: true,
  })
  return paint.alphas
}

afterEach(() => {
  vi.unstubAllGlobals()
  releaseGraphCanvases()
})

describe('a search that fades what it did not hit (G-14)', () => {
  it('draws every node at full weight while no search is on the canvas', () => {
    stubMatchMedia()
    expect(nodeAlphas(layout())).toEqual([1, 1, 1])
    expect(edgeAlphas(layout())).toEqual([GRAPH_EDGE_ALPHA, GRAPH_EDGE_ALPHA])
    expect(labelAlphas(layout())).toEqual([GRAPH_LABEL_ALPHA, GRAPH_LABEL_ALPHA, GRAPH_LABEL_ALPHA])
  })

  it('fades the nodes the search missed, and leaves the one it hit at full weight', () => {
    stubMatchMedia()
    expect(nodeAlphas(layout(new Set(['note-1'])))).toEqual([1, GRAPH_SEARCH_DIM_ALPHA, GRAPH_SEARCH_DIM_ALPHA])
  })

  it('keeps a line touching a match, and fades only the line between two misses', () => {
    stubMatchMedia()
    expect(edgeAlphas(layout(new Set(['note-1'])))).toEqual([GRAPH_EDGE_ALPHA, GRAPH_SEARCH_DIM_EDGE_ALPHA])
  })

  it('fades the words under a missed node as well as the node itself', () => {
    stubMatchMedia()
    expect(labelAlphas(layout(new Set(['note-1'])))).toEqual([GRAPH_LABEL_ALPHA, GRAPH_SEARCH_DIM_ALPHA, GRAPH_SEARCH_DIM_ALPHA])
  })

  it('fades every node when the search hit nothing at all', () => {
    stubMatchMedia()
    expect(nodeAlphas(layout(new Set()))).toEqual([GRAPH_SEARCH_DIM_ALPHA, GRAPH_SEARCH_DIM_ALPHA, GRAPH_SEARCH_DIM_ALPHA])
  })

  it('still puts the neighbours of what is hovered above the faded field', () => {
    stubMatchMedia()
    expect(nodeAlphas(layout(new Set(['note-1'])), 'note-2', new Set(['note-1']))).toEqual([1, 1, GRAPH_SEARCH_DIM_ALPHA])
  })
})

describe('the hit set the panel hands the canvas (G-14)', () => {
  it('lands on the layout the ticker is already holding', () => {
    stubMatchMedia()
    const hits = new Set(['note-1'])
    const graph = mountGraphCanvas(data, { searchHits: hits })
    expect(graph.state.searchHits).toBe(hits)
  })

  it('stays out of the frame for a graph that has no search box', () => {
    stubMatchMedia()
    const graph = mountGraphCanvas(data)
    expect(graph.state.searchHits).toBeNull()
  })
})
