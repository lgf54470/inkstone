import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphResponse } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import { mountGraphCanvas, releaseGraphCanvases, type GraphCanvasMount } from './graph-canvas-mount.test-helpers'

/**
 * Zooming the graph is a gesture the panel owns: the wheel over the canvas changes the camera and takes
 * the event away from the browser. React registers wheel at the root as a passive listener, where
 * `preventDefault()` is a no-op and Chrome says so out loud, so the canvas has to listen for it itself
 * (G-17). These cases read who is listening, with what options, and what the gesture still does.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const pair: GraphResponse = {
  nodes: [
    { id: 'a'.repeat(26), title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'b'.repeat(26), title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'a'.repeat(26), target: 'b'.repeat(26) }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

let wheelListeners: Array<{ onCanvas: boolean, options: unknown }> = []
let wheelRemoved: number = 0
let restoreAdd: (() => void) | null = null

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
  wheelListeners = []
  wheelRemoved = 0
  const original = EventTarget.prototype.addEventListener
  // React's own root delegation is a wheel listener too; what these cases ask is whether the canvas
  // itself was given one, and with what options.
  EventTarget.prototype.addEventListener = function patched(
    this: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: unknown,
  ) {
    if (type === 'wheel') wheelListeners.push({ onCanvas: this instanceof HTMLCanvasElement, options })
    return original.call(this, type as string, listener as EventListener, options as AddEventListenerOptions | undefined)
  }
  const originalRemove = EventTarget.prototype.removeEventListener
  EventTarget.prototype.removeEventListener = function patchedRemove(this: EventTarget, type: string) {
    if (type === 'wheel' && this instanceof HTMLCanvasElement) wheelRemoved += 1
    return originalRemove.apply(this, arguments as unknown as Parameters<typeof originalRemove>)
  }
  restoreAdd = () => {
    EventTarget.prototype.addEventListener = original
    EventTarget.prototype.removeEventListener = originalRemove
  }
})

afterEach(() => {
  releaseGraphCanvases()
  restoreAdd?.()
  restoreAdd = null
  vi.unstubAllGlobals()
})

function wheelOn(graph: GraphCanvasMount, deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, clientX: 400, clientY: 300, bubbles: true, cancelable: true })
  act(() => { graph.canvas.dispatchEvent(event) })
  return event
}

describe('the wheel over the graph canvas (G-17)', () => {
  it('is answered by a listener the canvas registers itself, and not a passive one', () => {
    mountGraphCanvas(pair)

    const onCanvas = wheelListeners.filter((entry) => entry.onCanvas)
    expect(onCanvas).toHaveLength(1)
    expect(onCanvas[0].options).toEqual({ passive: false })
  })

  it('still moves the camera toward the pointer and takes the gesture', () => {
    const graph = mountGraphCanvas(pair)
    const before = graph.state.scale

    const event = wheelOn(graph, -100)

    expect(graph.state.scale).toBeGreaterThan(before)
    expect(event.defaultPrevented).toBe(true)
  })

  it('is taken back when the canvas goes away', () => {
    mountGraphCanvas(pair)
    releaseGraphCanvases()

    // A listener left behind would zoom a graph that is no longer on screen.
    expect(wheelRemoved).toBe(1)
  })

  it('leaves the gesture alone at the zoom the drawing already has', () => {
    const graph = mountGraphCanvas(pair)
    // The far end of the slider: a wheel that cannot change the scale is a wheel the page keeps.
    graph.state.scale = 4
    const event = wheelOn(graph, -100)

    expect(graph.state.scale).toBe(4)
    expect(event.defaultPrevented).toBe(false)
  })
})
