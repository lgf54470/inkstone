import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphResponse, GraphNode } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import { mountGraphCanvas, pressKey, releaseGraphCanvases } from './graph-canvas-mount.test-helpers'
import { previewProbe } from './preview-stub.test-helpers'

/**
 * Selecting a node asks the panel for two things it holds in state: the announcement and the preview card.
 * Both used to be handed an object whose identity changed on every render, and because the effect that
 * writes them listed that object as a dependency, each write scheduled the next one: the panel never came
 * back. These cases count the paints one selection costs.
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
})

describe('one selection, one paint', () => {
  it('paints the preview card once for the node a reader selected', () => {
    const graph = mountGraphCanvas(pair)
    previewProbe.renders = 0

    pressKey(graph.canvas, 'ArrowRight')

    expect(graph.container.querySelector('[data-preview-card="Beta"]')).toBeTruthy()
    expect(previewProbe.renders).toBe(1)
  })

  it('keeps the single link-hover subscription it opened when the reader moves the selection', () => {
    const graph = mountGraphCanvas(pair)

    pressKey(graph.canvas, 'ArrowRight')
    pressKey(graph.canvas, 'ArrowLeft')

    expect(previewProbe.subscribes).toBe(1)
  })
})
