import { describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { DEFAULT_PREFERENCES } from './constants'
import { buildInitialLayout } from './canvas-draw'
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
    dragging: null,
    pointers: new Map(),
    pinch: null,
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
})
