import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { renderElement } from '../../../lib/test-render'
import { GraphCanvas } from './canvas'
import { DEFAULT_PREFERENCES } from './constants'
import type { CanvasState } from './types'

const note = {
  id: 'note-1',
  title: 'Note 1',
  kind: 'note' as const,
  degree: 1,
  inDegree: 0,
  outDegree: 1,
  folderId: null,
  folderName: null,
  folderColor: null,
  tags: [{ name: 'work', color: '#059669' }],
}

const tag = {
  id: 'tag:work',
  title: 'work',
  kind: 'tag' as const,
  degree: 1,
  inDegree: 1,
  outDegree: 0,
  folderId: null,
  folderName: null,
  folderColor: null,
  tags: [],
}

function response(nodes: GraphResponse['nodes'], edges: GraphResponse['edges']): GraphResponse {
  return {
    nodes,
    edges,
    meta: { mode: 'global', centerId: null, depth: 1, totalNodes: nodes.length, totalEdges: edges.length, truncated: false, limit: 350 },
  }
}

function graphElement(data: GraphResponse, canvas: HTMLCanvasElement): ReactNode {
  const state: CanvasState = {
    nodes: [],
    edges: [],
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    dragging: null,
    pointers: new Map(),
    pinch: null,
    frame: 0,
    raf: 0,
    schedule: null,
  }
  return createElement(GraphCanvas, {
    data,
    prefs: DEFAULT_PREFERENCES,
    activeNoteId: null,
    canvasRef: { current: canvas },
    stateRef: { current: state },
    hoverRef: { current: null },
    selectedIdRef: { current: null },
    activeNoteIdRef: { current: null },
    lastPointerEventAtRef: { current: 0 },
    onOpenNote: vi.fn(),
    onCreateNote: vi.fn(),
    onClose: vi.fn(),
    onMakeLocal: vi.fn(),
    controlsRef: { current: null },
  })
}

function stubCanvasPainting(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ({
      setTransform: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeText: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
    }),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

describe('graph color legend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the tag groups of the response on screen, not of the one before it', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })))
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const restoreContext = stubCanvasPainting()
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 400

    const rendered = renderElement(graphElement(response([note], []), canvas))
    expect(rendered.container.textContent).not.toContain('work')

    rendered.rerender(graphElement(response([note, tag], [{ source: 'note-1', target: 'tag:work' }]), canvas))
    const swatches = [...rendered.container.querySelectorAll('span')]
      .filter((span) => span.textContent === 'work')
      .map((span) => span.previousElementSibling)
    expect(swatches).toHaveLength(1)
    expect(swatches[0]?.getAttribute('style')).toContain('background-color: rgb(5, 150, 105)')
    rendered.unmount()
    restoreContext()
  })
})
