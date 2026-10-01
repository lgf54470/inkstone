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
}

const mounted: RenderedElement[] = []
const contexts: Array<() => void> = []

/** jsdom hands back no 2d context, so the panel would never build a layout: the painting is stubbed, the state it fills is real. */
function stubContext(): void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => new Proxy({}, {
      get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}),
    }),
  })
  contexts.push(() => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original))
}

export function mountGraphCanvas(data: GraphResponse, options: GraphCanvasMountOptions = {}): GraphCanvasMount {
  stubContext()
  const open = vi.fn()
  const create = vi.fn()
  const close = vi.fn()
  const local = vi.fn()
  const filterByTag = vi.fn()
  const state: CanvasState = {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null,
    frame: 0, raf: 0, schedule: null,
  }
  const rendered = renderElement(createElement(GraphCanvas, {
    data,
    prefs: options.prefs ?? DEFAULT_PREFERENCES,
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
    onFilterByTag: filterByTag,
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

export function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}
