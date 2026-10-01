import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES } from './constants'
import { readThemeColors } from './canvas-draw'
import {
  graphExportBounds,
  graphExportFilename,
  graphExportGeometry,
  graphExportPng,
  graphExportSvg,
  runGraphExport,
} from './graph-export'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { CanvasNode, CanvasState } from './types'

/**
 * An export has to put the whole graph, and only the graph, into a file: the box is computed from the
 * nodes rather than the viewport, the vector emitter draws what the canvas draws, and the raster path
 * hands the browser a picture it can actually allocate. These cases pin the box, the file, and the
 * promise that a picture the reader asked for either arrives or says why it did not.
 */

function node(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'note-1', title: 'Note 1', kind: 'note' as const, degree: 1, inDegree: 1, outDegree: 0,
    folderId: null, folderName: null, folderColor: null, tags: [],
    x: 0, y: 0, vx: 0, vy: 0, r: 10, tagColor: null, colorGroup: null,
    ...overrides,
  }
}

function createState(nodes: CanvasNode[], edges: Array<{ a: CanvasNode; b: CanvasNode }> = []): CanvasState {
  return {
    nodes, edges, scale: 1.5, offsetX: 40, offsetY: 60, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, frame: 360, raf: 0, schedule: null,
  }
}

const linked = node({ id: 'note-1', title: 'Note 1', x: 0, y: 0, r: 10 })
const far = node({ id: 'note-2', title: 'Note 2', x: 100, y: 40, r: 20, inDegree: 0, outDegree: 1 })

describe('graph export box (FEAT-05)', () => {
  it('wraps every node, its title and clearance into the box the file draws', () => {
    expect(graphExportBounds([linked, far], true)).toEqual({ minX: -34, minY: -34, width: 178, height: 141 })
  })

  it('leaves no title room once the reader turns titles off', () => {
    expect(graphExportBounds([linked, far], false)).toEqual({ minX: -34, minY: -34, width: 178, height: 118 })
  })

  it('keeps a graph with no nodes inside a finite box', () => {
    const bounds = graphExportBounds([], true)
    expect(Number.isFinite(bounds.width) && Number.isFinite(bounds.height)).toBe(true)
    expect(bounds).toEqual({ minX: 0, minY: 0, width: 48, height: 48 })
  })

  it('exports at two device pixels per world unit while the graph fits', () => {
    expect(graphExportGeometry({ minX: 0, minY: 0, width: 400, height: 300 }))
      .toEqual({ scale: 2, width: 800, height: 600 })
  })

  it('shrinks a sprawling graph instead of asking for a canvas the browser refuses', () => {
    const geometry = graphExportGeometry({ minX: 0, minY: 0, width: 9000, height: 1000 })
    expect(geometry.width).toBe(4000)
    expect(geometry.scale).toBeCloseTo(4000 / 9000, 6)
  })

  it('names the file after the scope the graph was built for', () => {
    expect(graphExportFilename('global', 'png')).toBe('graph-global.png')
    expect(graphExportFilename('local', 'svg')).toBe('graph-local.svg')
  })
})

function svg(nodes: CanvasNode[], prefs: GraphPreferences = DEFAULT_PREFERENCES, edges = [{ a: linked, b: far }]): string {
  return graphExportSvg(createState(nodes, nodes.length > 1 ? edges : []), readThemeColors(), prefs, 'Inter')
}

describe('graph vector nodes (FEAT-05)', () => {
  it('draws every node as a vector circle in the colour it is painted', () => {
    const ruled = node({ colorGroup: '#dc2626' })
    const tag = node({ id: 'tag:work', title: 'work', kind: 'tag' as const, x: 100, y: 40, r: 20, tagColor: '#059669' })
    const file = svg([ruled, tag])
    expect(file).toContain('<circle cx="0" cy="0" r="10" fill="#dc2626"/>')
    expect(file).toContain('<circle cx="100" cy="40" r="20" fill="#059669"/>')
    expect(file).toContain('<line x1="0" y1="0" x2="100" y2="40"')
    expect(file.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
  })

  it('writes each title the way the panel writes it: a tag carries its sigil, a long title is cut short', () => {
    const tag = node({ id: 'tag:work', title: 'work', kind: 'tag' as const })
    const long = node({ id: 'long', title: 'A quarterly review of the reading list' })
    const file = svg([tag, long])
    expect(file).toContain('>#work</text>')
    expect(file).toContain('>A quarterly review…</text>')
    expect(file).not.toContain('reading list')
  })

  it('rings an unresolved note and a pinned node the way the canvas draws them', () => {
    const unresolved = node({ id: 'u', title: 'Ghost', kind: 'unresolved' as const, degree: 0, inDegree: 0, outDegree: 0 })
    const pinned = node({ id: 'p', title: 'Pinned', degree: 2, pinned: true })
    const file = svg([unresolved, pinned])
    expect(file).toContain('fill="none" stroke="#777" stroke-width="1.5"')
    expect(file).toContain('stroke="#4f46e5" stroke-width="1.5" opacity="0.8"')
  })
})

describe('graph vector links and titles (FEAT-05)', () => {
  it('draws a link head only while link direction is on, with its tip just outside the node it points at', () => {
    // Read by hand from the rule the panel draws with: the tip sits 2 units short of the rim of the node
    // at (100, 40) r 20, and the two arms are 5 units long at ±30 degrees off the link.
    expect(svg([linked, far])).toContain('<polygon points="79.57 31.83 74.62 32.54 76.48 27.9"')
    expect(svg([linked, far], { ...DEFAULT_PREFERENCES, arrows: false })).not.toContain('<polygon')
  })

  it('leaves a node nobody links to without a title, the way the canvas does', () => {
    const lonely = node({ id: 'l', title: 'Lonely', degree: 0, inDegree: 0, outDegree: 0 })
    const file = svg([linked, lonely])
    expect(file).toContain('>Note 1</text>')
    expect(file).not.toContain('Lonely')
  })

  it('escapes a title that carries markup before it reaches the file', () => {
    const hostile = node({ title: '<img src=x>' })
    const file = svg([hostile])
    expect(file).toContain('&lt;img src=x&gt;')
    expect(file).not.toContain('<img')
  })
})

interface PaintCalls {
  canvas: HTMLCanvasElement | null
  setTransform: number[][]
  arc: number[][]
  fillText: string[]
}

function emptyPaintCalls(): PaintCalls {
  return { canvas: null, setTransform: [], arc: [], fillText: [] }
}

function encodesPng(done: (blob: Blob | null) => void): void {
  done(new Blob(['png'], { type: 'image/png' }))
}

let calls = emptyPaintCalls()

function stubPainting(encode: (done: (blob: Blob | null) => void) => void): () => void {
  const context = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  const toBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob')
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function paint(this: HTMLCanvasElement) {
      calls.canvas = this
      return {
        setTransform: (...args: number[]) => { calls.setTransform.push(args) },
        fillRect: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
        beginPath: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {},
        moveTo: () => {}, lineTo: () => {},
        arc: (...args: number[]) => { calls.arc.push(args) },
        fillText: (text: string) => { calls.fillText.push(String(text)) },
        strokeText: () => {},
      }
    },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { configurable: true, writable: true, value: encode })
  return () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', context)
    if (toBlob) Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', toBlob)
    else delete (HTMLCanvasElement.prototype as unknown as { toBlob?: unknown }).toBlob
  }
}

function startPainting(encode = encodesPng): () => void {
  calls = emptyPaintCalls()
  return stubPainting(encode)
}

const pair = (): CanvasState => createState([linked, far], [{ a: linked, b: far }])
const png = (state: CanvasState) => graphExportPng(state, readThemeColors(), DEFAULT_PREFERENCES, 'Inter')

let restore: (() => void) | null = null

afterEach(() => {
  restore?.()
  restore = null
})

describe('graph raster painting (FEAT-05)', () => {
  it('draws one circle per node and a title for every linked node', async () => {
    restore = startPainting()
    await png(pair())
    expect(calls.arc).toHaveLength(2)
    expect(calls.fillText).toEqual(['Note 1', 'Note 2'])
  })

  it('leaves a node nobody links to without a title in the picture, whatever zoom the reader is at', async () => {
    restore = startPainting()
    const lonely = node({ id: 'l', title: 'Lonely', degree: 0, inDegree: 0, outDegree: 0 })
    await png(createState([linked, far, lonely], [{ a: linked, b: far }]))
    expect(calls.fillText).toEqual(['Note 1', 'Note 2'])
  })

  it('paints the whole graph at the export scale, not at the zoom on screen', async () => {
    restore = startPainting()
    await png(pair())
    expect(calls.setTransform[0]).toEqual([2, 0, 0, 2, 68, 68])
    expect(calls.canvas?.width).toBe(356)
    expect(calls.canvas?.height).toBe(282)
  })
})

describe('graph raster canvas (FEAT-05)', () => {
  it('leaves the zoom the reader is looking at untouched by the export', async () => {
    restore = startPainting()
    const state = pair()
    await png(state)
    expect(state.scale).toBe(1.5)
    expect(state.width).toBe(800)
  })

  it('shrinks a sprawling graph to a canvas the browser will hand back', async () => {
    restore = startPainting()
    const wide = node({ id: 'wide', title: 'Wide', x: 9000, y: 0 })
    await png(createState([linked, wide], [{ a: linked, b: wide }]))
    expect(calls.canvas?.width).toBeLessThanOrEqual(4000)
    expect(calls.canvas?.width).toBeGreaterThan(0)
  })

  it('says why the picture could not be encoded instead of saving nothing', async () => {
    restore = startPainting((done) => { done(null) })
    await expect(png(pair())).rejects.toThrow(/PNG/)
  })
})

const saved: Array<{ name: string; type: string; size: number }> = []
const cleanups: Array<() => void> = []

function stubSave(): void {
  let lastBlob: Blob | null = null
  const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => { lastBlob = blob; return 'blob:graph' },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} })
  const spy = vi.spyOn(document.body, 'append').mockImplementation((...children: (Node | string)[]) => {
    for (const child of children) {
      if (child instanceof HTMLAnchorElement) {
        child.click = () => {}
        saved.push({ name: child.download, type: lastBlob?.type ?? '', size: lastBlob?.size ?? 0 })
      }
    }
  })
  cleanups.push(() => {
    if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL)
    if (revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURL)
    spy.mockRestore()
  })
}

function resetSaveStub(): void {
  while (cleanups.length) cleanups.pop()!()
  saved.length = 0
}

describe('graph export file (FEAT-05)', () => {
  afterEach(resetSaveStub)

  it('saves the vector file under the scope the graph was built for', async () => {
    stubSave()
    await runGraphExport(pair(), { ...DEFAULT_PREFERENCES, mode: 'local' }, 'svg')
    expect(saved).toHaveLength(1)
    expect(saved[0]!.name).toBe('graph-local.svg')
    expect(saved[0]!.type).toBe('image/svg+xml;charset=utf-8')
    expect(saved[0]!.size).toBeGreaterThan(0)
  })

  it('saves the picture the reader asked for, not an empty file', async () => {
    stubSave()
    cleanups.push(startPainting())
    await runGraphExport(pair(), DEFAULT_PREFERENCES, 'png')
    expect(saved.map((file) => file.name)).toEqual(['graph-global.png'])
    expect(saved[0]!.size).toBeGreaterThan(0)
  })
})


