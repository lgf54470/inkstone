import { describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { DEFAULT_PREFERENCES } from './constants'
import {
  buildInitialLayout,
  createCanvasResizer,
  createGraphTicker,
  createThemeObserver,
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

describe('theme following', () => {
  it('reads theme colors from document computed style or fallbacks', () => {
    const colors = readThemeColors()
    expect(colors.edge).toBeTruthy()
    expect(colors.node).toBeTruthy()
    expect(colors.accent).toBeTruthy()
    expect(colors.text).toBeTruthy()
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

function mockCanvasContext(clearRectCalls: Array<[number, number, number, number]>) {
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
      fillText: () => {},
    }),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

describe('layout thrashing prevention (PERF-02)', () => {
  it('caches canvas width and height during resize without measuring in tick', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
    const clearRectCalls: Array<[number, number, number, number]> = []
    const restoreContext = mockCanvasContext(clearRectCalls)
    const canvas = document.createElement('canvas')
    const getBoundingClientRectSpy = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => {},
    })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    const state = createInitialState()
    const { resize, observer } = createCanvasResizer(canvas, ctx, state)
    resize()
    expect(state.width).toBe(800)
    expect(state.height).toBe(600)
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(1)
    const colors = readThemeColors()
    const prefsRef = { current: DEFAULT_PREFERENCES }
    const hoverRef = { current: null }, selectedIdRef = { current: null }, activeNoteIdRef = { current: null }
    const style = document.createElement('div').style
    createGraphTicker(state, canvas, ctx, colors, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style)
    state.schedule?.()
    expect(getBoundingClientRectSpy).toHaveBeenCalledTimes(1)
    expect(clearRectCalls.length).toBeGreaterThanOrEqual(1)
    expect(clearRectCalls[0]).toEqual([0, 0, 800, 600])
    observer.disconnect()
    restoreContext()
  })
})
