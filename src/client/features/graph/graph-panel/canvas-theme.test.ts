import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { GraphCanvas } from './canvas'
import { createThemeObserver, readThemeColors } from './canvas-draw'
import { DEFAULT_PREFERENCES, PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasState } from './types'

/**
 * A canvas paints colours it reads itself, so nothing in the browser notices a theme flip for it: the
 * panel has to re-read the tokens and redraw. These cases read the two halves of that promise — the
 * colours come from the document, and a flip reaches the pixels that are already on screen.
 */

const dark = {
  '--border-strong': 'rgb(11, 12, 13)',
  '--text-tertiary': 'rgb(21, 22, 23)',
  '--accent': 'rgb(34, 56, 78)',
  '--text-secondary': 'rgb(44, 45, 46)',
  '--bg-base': 'rgb(5, 6, 7)',
}

const light = {
  '--border-strong': 'rgb(211, 212, 213)',
  '--text-tertiary': 'rgb(151, 152, 153)',
  '--accent': 'rgb(130, 90, 20)',
  '--text-secondary': 'rgb(121, 122, 123)',
  '--bg-base': 'rgb(250, 251, 252)',
}

function setTokens(palette: Record<string, string>): void {
  for (const [name, value] of Object.entries(palette)) document.documentElement.style.setProperty(name, value)
}

const data: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function idleState(): CanvasState {
  return {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, frame: PHYSICS_FRAME_LIMIT, raf: 0, schedule: null,
  }
}

function recording(fills: string[], strokes: string[]): CanvasRenderingContext2D {
  let fillStyle = ''
  let strokeStyle = ''
  const noop = () => {}
  return {
    get fillStyle() { return fillStyle },
    set fillStyle(value: string) { fillStyle = String(value) },
    get strokeStyle() { return strokeStyle },
    set strokeStyle(value: string) { strokeStyle = String(value) },
    setTransform: noop, clearRect: noop, save: noop, restore: noop, translate: noop, scale: noop,
    beginPath: noop, closePath: noop, arc: noop, moveTo: noop, lineTo: noop, fillText: noop, strokeText: noop,
    fill: () => { fills.push(fillStyle) },
    stroke: () => { strokes.push(strokeStyle) },
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D
}

function stubContext(fills: string[], strokes: string[]): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => recording(fills, strokes),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

const mounted: RenderedElement[] = []

/**
 * Frames are queued rather than run inline: a synchronous `requestAnimationFrame` would make the physics
 * loop re-enter itself, and the id it hands back would be written after the loop had already cleared it,
 * leaving the panel looking like a frame was still in flight.
 */
let frameQueue: FrameRequestCallback[] = []
let frameId = 0

function paintFrames(): number {
  let painted = 0
  while (frameQueue.length && painted < PHYSICS_FRAME_LIMIT + 40) {
    const due = frameQueue
    frameQueue = []
    for (const callback of due) callback(0)
    painted++
  }
  return painted
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frameQueue.push(callback); return ++frameId })
  vi.stubGlobal('cancelAnimationFrame', () => { frameQueue = [] })
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  frameQueue = []
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
  for (const name of Object.keys(dark)) document.documentElement.style.removeProperty(name)
})

describe('theme colors of the document', () => {
  it('reads every colour the canvas paints from the tokens the document carries', () => {
    setTokens(dark)
    expect(readThemeColors()).toEqual({
      edge: 'rgb(11, 12, 13)',
      node: 'rgb(21, 22, 23)',
      accent: 'rgb(34, 56, 78)',
      text: 'rgb(44, 45, 46)',
      bgBase: 'rgb(5, 6, 7)',
    })
  })

})

describe('a theme flip that reaches the colours themselves', () => {
  it('re-reads the tokens into the reference the drawing reads, so a flip lands in the colours themselves', async () => {
    setTokens(dark)
    const colorsRef = { current: readThemeColors() }
    const onUpdate = vi.fn()
    const observer = createThemeObserver(colorsRef, onUpdate)
    const before = colorsRef.current.node

    setTokens(light)
    document.documentElement.setAttribute('data-theme', 'light')
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    expect(onUpdate).toHaveBeenCalled()
    expect(before).toBe('rgb(21, 22, 23)')
    expect(colorsRef.current.node).toBe('rgb(151, 152, 153)')
    observer.disconnect()
  })
})

describe('repainting the graph the reader is looking at', () => {
  it('redraws the graph a reader is looking at with the colours of the theme they flipped to', async () => {
    setTokens(dark)
    document.documentElement.setAttribute('data-theme', 'dark')
    const fills: string[] = []
    const strokes: string[] = []
    const restoreContext = stubContext(fills, strokes)
    const rendered = renderElement(createElement(GraphCanvas, {
      data,
      prefs: DEFAULT_PREFERENCES,
      activeNoteId: 'note-1',
      canvasRef: { current: document.createElement('canvas') },
      stateRef: { current: idleState() },
      hoverRef: { current: null },
      selectedIdRef: { current: null },
      activeNoteIdRef: { current: null },
      lastPointerEventAtRef: { current: 0 },
      onOpenNote: vi.fn(),
      onCreateNote: vi.fn(),
      onClose: vi.fn(),
      onMakeLocal: vi.fn(),
      controlsRef: { current: null },
    }))
    mounted.push(rendered)
    paintFrames()

    expect(fills).toContain('rgb(34, 56, 78)')
    expect(fills).toContain('rgb(21, 22, 23)')
    expect(strokes).toContain('rgb(11, 12, 13)')
    fills.length = 0
    strokes.length = 0

    setTokens(light)
    document.documentElement.setAttribute('data-theme', 'light')
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    paintFrames()

    expect(fills).toContain('rgb(151, 152, 153)')
    expect(fills).toContain('rgb(130, 90, 20)')
    expect(strokes).toContain('rgb(211, 212, 213)')
    expect(fills).not.toContain('rgb(21, 22, 23)')
    restoreContext()
  })
})
