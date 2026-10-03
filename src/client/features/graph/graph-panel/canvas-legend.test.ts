import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import type { GraphPreferences } from '../../../lib/graph-settings'
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
  folderPath: null,
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
  folderPath: null,
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

function graphElement(data: GraphResponse, canvas: HTMLCanvasElement, prefs: GraphPreferences = DEFAULT_PREFERENCES, extra: Record<string, unknown> = {}): ReactNode {
  const state: CanvasState = {
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
  return createElement(GraphCanvas, {
    data,
    prefs,
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
    ...extra,
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

function prepareGraph(): () => void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return stubCanvasPainting()
}

function legendSwatches(container: HTMLElement, label: string): HTMLElement[] {
  return [...container.querySelectorAll('span')]
    .filter((span) => span.textContent === label)
    .map((span) => span.previousElementSibling as HTMLElement)
}

/** Mounts the canvas with the painting stubbed away, and hands back the legend it drew. */
function mountLegend(element: (canvas: HTMLCanvasElement) => ReactNode): { canvas: HTMLCanvasElement, container: HTMLElement, rerender: (node: ReactNode) => void, close: () => void } {
  const restoreContext = prepareGraph()
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 400
  const rendered = renderElement(element(canvas))
  return {
    canvas,
    container: rendered.container,
    rerender: rendered.rerender,
    close: () => { rendered.unmount(); restoreContext() },
  }
}

describe('graph color legend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the tag groups of the response on screen, not of the one before it', () => {
    const graph = mountLegend((canvas) => graphElement(response([note], []), canvas))
    expect(graph.container.textContent).not.toContain('work')

    graph.rerender(graphElement(response([note, tag], [{ source: 'note-1', target: 'tag:work' }]), graph.canvas))
    const swatches = legendSwatches(graph.container, 'work')
    expect(swatches).toHaveLength(1)
    expect(swatches[0]?.getAttribute('style')).toContain('background-color: rgb(5, 150, 105)')
    graph.close()
  })

  it('paints a tag with no colour of its own by the token of its slot, so the theme decides the value', () => {
    const idea = { ...tag, id: 'tag:idea', title: 'idea' }
    const graph = mountLegend((canvas) => graphElement(response([idea], []), canvas))
    const swatches = legendSwatches(graph.container, 'idea')
    expect(swatches).toHaveLength(1)
    expect(swatches[0]?.getAttribute('style')).toContain('background-color: var(--graph-tag-4)')
    graph.close()
  })
})

describe('folders that share their last word (G-48)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Two notes, two folders, one word: only the path says which is which. */
  const nested = (): GraphResponse => response([
    { ...note, id: 'a', folderId: 'wn', folderPath: 'Work/Notes', folderColor: '#dc2626', tags: [] },
    { ...note, id: 'b', folderId: 'rn', folderPath: 'Reading Room/Notes', folderColor: '#059669', tags: [] },
  ], [{ source: 'a', target: 'b' }])

  it('draws one row per folder rather than one row per last word', () => {
    const graph = mountLegend((canvas) => graphElement(nested(), canvas, { ...DEFAULT_PREFERENCES, groupBy: 'folder' }))

    expect(legendSwatches(graph.container, 'Work/Notes')).toHaveLength(1)
    expect(legendSwatches(graph.container, 'Reading Room/Notes')).toHaveLength(1)
    expect(legendSwatches(graph.container, 'Notes')).toHaveLength(0)
    graph.close()
  })

  it('hands the whole path back as one filter term, quoted when it holds a space', () => {
    const graph = mountLegend((canvas) => graphElement(
      nested(), canvas, { ...DEFAULT_PREFERENCES, groupBy: 'folder' }, { onLegendSelect: vi.fn() },
    ))
    const queries = [...graph.container.querySelectorAll('button[data-legend-query]')]
      .map((button) => button.getAttribute('data-legend-query'))

    expect(queries).toContain('path:Work/Notes')
    expect(queries).toContain('path:"Reading Room/Notes"')
    graph.close()
  })
})

describe('graph color rule legend', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const withRule = (canvas: HTMLCanvasElement, data: GraphResponse = response([note], [])): ReactNode => graphElement(data, canvas, {
    ...DEFAULT_PREFERENCES,
    colorGroups: [{ id: 'r1', query: 'tag:work', color: '#4f46e5' }],
  })

  it('names a colour rule by its own filter line, in the colour it paints', () => {
    const graph = mountLegend((canvas) => withRule(canvas))
    const swatches = legendSwatches(graph.container, 'tag:work')
    expect(swatches).toHaveLength(1)
    expect(swatches[0]?.getAttribute('style')).toContain('background-color: rgb(79, 70, 229)')
    graph.close()
  })

  it('redraws the legend when a rule is edited without new data', () => {
    const data = response([note], [])
    const graph = mountLegend((canvas) => graphElement(data, canvas))
    expect(legendSwatches(graph.container, 'tag:work')).toHaveLength(0)

    graph.rerender(withRule(graph.canvas, data))
    const swatches = legendSwatches(graph.container, 'tag:work')
    expect(swatches).toHaveLength(1)
    expect(swatches[0]?.getAttribute('style')).toContain('background-color: rgb(79, 70, 229)')
    graph.close()
  })
})
