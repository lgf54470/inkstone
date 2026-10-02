import { act, createElement } from 'react'
import { vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { GraphCanvas } from './canvas'
import { DEFAULT_PREFERENCES } from './constants'
import type { CanvasState } from './types'

/**
 * Mounting the graph surface needs a canvas that paints, a physics state the test can read, and the
 * callbacks the panel calls back into. Tests that drive the panel by hand share this scaffolding; what
 * each of them asserts stays in its own file.
 */

export interface GraphCanvasMount {
  canvas: HTMLCanvasElement
  container: HTMLElement
  state: CanvasState
  open: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  local: ReturnType<typeof vi.fn>
  filterByTag: ReturnType<typeof vi.fn>
}

export interface GraphCanvasMountOptions {
  prefs?: GraphPreferences
  activeNoteId?: string | null
  /** The graph inside a note has no tag filter to narrow, and mounts the canvas without the callback. */
  withoutTagFilter?: boolean
  /** The set the search box hit; absent means no search is being located by. */
  searchHits?: ReadonlySet<string> | null
  /** The panel the canvas reports a pin to; absent means the pin is not persisted (G-07). */
  onPinChange?: (id: string, pinned: boolean) => void
  /** A frame the fixture refuses, asked per paint so a case can hand the picture back between presses. */
  shouldFailPaint?: () => boolean
}

const mounted: RenderedElement[] = []
const contexts: Array<() => void> = []

/** jsdom hands back no 2d context, so the panel would never build a layout: the painting is stubbed, the state it fills is real. */
function stubContext(shouldFail?: () => boolean): void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'measureText') return () => ({ width: 10 })
        if (key === 'clearRect' && shouldFail?.()) return () => { throw new Error('the fixture refuses the frame') }
        return () => {}
      },
    }),
  })
  contexts.push(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original))
}

export function mountGraphCanvas(data: GraphResponse, options: GraphCanvasMountOptions = {}): GraphCanvasMount {
  stubContext(options.shouldFailPaint)
  const open = vi.fn()
  const create = vi.fn()
  const close = vi.fn()
  const local = vi.fn()
  const filterByTag = vi.fn()
  const state: CanvasState = {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null,
    frame: 0, raf: 0, schedule: null,
  }
  const rendered = renderElement(createElement(GraphCanvas, {
    data,
    prefs: options.prefs ?? DEFAULT_PREFERENCES,
    searchHits: options.searchHits ?? null,
    activeNoteId: options.activeNoteId ?? null,
    canvasRef: { current: null },
    stateRef: { current: state },
    hoverRef: { current: null },
    selectedIdRef: { current: null },
    activeNoteIdRef: { current: null },
    lastPointerEventAtRef: { current: 0 },
    onOpenNote: open,
    onCreateNote: create,
    onClose: close,
    onMakeLocal: local,
    onPinChange: options.onPinChange,
    onFilterByTag: options.withoutTagFilter ? undefined : filterByTag,
    controlsRef: { current: null },
  }))
  mounted.push(rendered)
  return {
    canvas: rendered.container.querySelector('canvas')!,
    container: rendered.container,
    state,
    open,
    create,
    close,
    local,
    filterByTag,
  }
}

/** Releases every canvas mounted by the current test, so a stray effect cannot reach the next one. */
export function releaseGraphCanvases(): void {
  while (mounted.length) mounted.pop()!.unmount()
  while (contexts.length) contexts.pop()!()
}

/**
 * Puts the fixture's nodes where the case wants them. The arrow keys read the drawing's own layout
 * (G-23), and the spiral the panel lays a response out on is not a layout a case can reason about —
 * so a case says where its nodes are before it presses a key. Untouched nodes keep the panel's.
 */
export function placeNodes(graph: GraphCanvasMount, byTitle: Record<string, [number, number]>): void {
  for (const node of graph.state.nodes) {
    const point = byTitle[node.title]
    if (point) { node.x = point[0]; node.y = point[1] }
  }
}

/**
 * Walks the keyboard onto the node placed to the right of the first one: the first press enters at
 * the first node of the response, the second steps right to the neighbour the case placed there.
 */
export function walkRightTo(graph: GraphCanvasMount, byTitle: Record<string, [number, number]>): void {
  placeNodes(graph, byTitle)
  pressKey(graph.canvas, 'ArrowRight')
  pressKey(graph.canvas, 'ArrowRight')
}

/**
 * What the device answers when the app asks whether it has a coarse pointer. The panel reads that to
 * decide which gestures its own description names, so a case that cares about the wording says what
 * the hardware is rather than leaving the question to the environment's default.
 */
export function stubPointerDevice({ coarse }: { coarse: boolean }): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
}

export function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}

/**
 * A pointer press as the canvas reads it: jsdom has no PointerEvent and no pointer capture, so the
 * gesture carries the fields the handlers read and the capture call is stubbed by the cases.
 */
export function pressPointer(target: Element, type: 'pointerdown' | 'pointerup', clientX: number, clientY: number, init: MouseEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, ...init }))
  })
}

/** A pointer move as the canvas reads it: the middle of a gesture `pressPointer` opens and closes. */
export function movePointer(target: Element, clientX: number, clientY: number): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX, clientY, button: 0 }))
  })
}

/**
 * A gesture the browser takes back, which the canvas drops without ever reaching the release: what a
 * reader gets when a touch turns into a scroll, or another app steals the pointer.
 */
export function cancelPointer(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }))
  })
}
