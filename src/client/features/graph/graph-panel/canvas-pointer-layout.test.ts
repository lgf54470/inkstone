import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphNode, GraphResponse } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import { mountGraphCanvas, releaseGraphCanvases } from './graph-canvas-mount.test-helpers'

/**
 * A drag reads the pointer's place in the graph on every move, and the canvas box that reading is
 * measured against does not move while the pointer does. Asking the layout engine for that box on each
 * event forced a synchronous layout per move; the box is now kept beside the numbers the resize
 * observer already watches. This case counts the box reads one drag costs.
 */

vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function node(id: string, title: string): GraphNode {
  return {
    id, title, kind: 'note', degree: 1, inDegree: 0, outDegree: 1,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const pair: GraphResponse = {
  nodes: [node('note-1', 'Alpha'), node('note-2', 'Beta')],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

beforeAll(async () => {
  await initI18n()
  // jsdom has neither a PointerEvent nor pointer capture, so the gesture carries the fields the
  // handlers read and the capture call is stubbed out.
  HTMLElement.prototype.setPointerCapture = function capture() {}
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => releaseGraphCanvases())

function pointer(target: Element, type: string, clientX: number, clientY: number): void {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }))
  })
}

describe('pointer moves during a drag (G-09)', () => {
  it('drags a node without measuring the canvas box again', () => {
    const graph = mountGraphCanvas(pair)
    const box = graph.canvas.getBoundingClientRect()
    let reads = 0
    vi.spyOn(graph.canvas, 'getBoundingClientRect').mockImplementation(() => {
      reads += 1
      return box
    })
    const first = graph.state.nodes[0]!
    const fromX = graph.state.viewLeft + graph.state.offsetX + first.x * graph.state.scale
    const fromY = graph.state.viewTop + graph.state.offsetY + first.y * graph.state.scale
    const startedAt = first.x

    pointer(graph.canvas, 'pointerdown', fromX, fromY)
    // Selecting the node is where the panel's own preview card measures the canvas: once per
    // selection, and that is where the count starts, because the moves are what this case is about.
    const settled = reads
    for (let step = 1; step <= 6; step++) pointer(graph.canvas, 'pointermove', fromX + step, fromY + step)

    expect(graph.state.dragging?.node?.id).toBe('note-1')
    expect(first.x).toBeGreaterThan(startedAt)
    expect(reads).toBe(settled)
  })
})
