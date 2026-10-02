import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphNode, GraphResponse } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import {
  mountGraphCanvas,
  placeNodes,
  releaseGraphCanvases,
  movePointer,
  type GraphCanvasMount,
} from './graph-canvas-mount.test-helpers'
import { previewProbe } from './preview-stub.test-helpers'

/**
 * 6.4 turned six magic numbers into named constants, which leaves the *values* without a guard: a reader
 * who waits twice as long for a card, or a graph that fades the preview away a heartbeat too early, is a
 * change no existing case notices (F-08). These cases say the numbers out loud and read what the panel
 * did at each side of them — the hover card appears at 300ms and not one tick earlier, and it goes away at
 * 200ms, whatever the constants happen to hold today.
 */
vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function node(id: string, title: string, inDegree: number, outDegree: number): GraphNode {
  return {
    id, title, kind: 'note',
    degree: inDegree + outDegree, inDegree, outDegree,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const pair: GraphResponse = {
  nodes: [node('note-1', 'Alpha', 1, 2), node('note-2', 'Beta', 0, 1)],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

/** The card the panel is holding, by the title it names, or null when nothing is on screen. */
function cardTitle(graph: GraphCanvasMount): string | null {
  return graph.container.querySelector('[data-preview-card]')?.getAttribute('data-preview-card') ?? null
}

function hoverableGraph(): GraphCanvasMount {
  const graph = mountGraphCanvas(pair)
  placeNodes(graph, { Alpha: [100, 100], Beta: [500, 400] })
  vi.spyOn(graph.canvas, 'getBoundingClientRect').mockImplementation(() => ({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect)
  return graph
}

function tick(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
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
  previewProbe.renders = 0
  previewProbe.subscribes = 0
  previewProbe.anchor = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('how long a reader holds the pointer still (F-08)', () => {
  it('shows the card at 300ms, and not one tick before', () => {
    vi.useFakeTimers()
    const graph = hoverableGraph()

    movePointer(graph.canvas, 100, 100)
    expect(cardTitle(graph)).toBeNull()

    tick(299)
    expect(cardTitle(graph)).toBeNull()

    tick(1)
    expect(cardTitle(graph)).toBe('Alpha')
  })

  it('puts the card away 200ms after the pointer leaves the node', () => {
    vi.useFakeTimers()
    const graph = hoverableGraph()

    movePointer(graph.canvas, 100, 100)
    tick(300)
    expect(cardTitle(graph)).toBe('Alpha')

    movePointer(graph.canvas, 760, 560)
    tick(199)
    expect(cardTitle(graph)).toBe('Alpha')

    tick(1)
    expect(cardTitle(graph)).toBeNull()
  })

  it('does not open a card for a pointer that left before the wait was over', () => {
    vi.useFakeTimers()
    const graph = hoverableGraph()

    movePointer(graph.canvas, 100, 100)
    tick(200)
    movePointer(graph.canvas, 760, 560)
    tick(400)

    expect(cardTitle(graph)).toBeNull()
  })
})
