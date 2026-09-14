import { vi } from 'vitest'
import { renderMarkdown } from '../renderer'
import { mountMindmaps } from './registry'
import type { MindmapCreateOptions, MindmapFenceRef, MindmapHandle, MindmapVendor, MindmapWriteResult } from './types'

export interface StubMap {
  el: HTMLElement
  options: MindmapCreateOptions
  current: string
  refreshes: unknown[]
  historyCleared: boolean
  destroyed: boolean
  focusCalls: number
  layoutCalls: number
  fitCalls: number
  /** The toolbar button the real library points at the browser's full screen. */
  toolbarFullscreen: HTMLElement | null
  nativeFullscreenCalls: number
  toolbarCenterCalls: number
}

/**
 * The library appends its own toolbar — a button that asks the browser for
 * native full screen, plus the view controls — to the element it was given. The
 * stub mirrors that contract so the registry's handling of it shows up in a test
 * rather than only in a browser.
 */
function installToolbarStub(record: StubMap): void {
  const toolbar = document.createElement('div')
  toolbar.className = 'mind-elixir-toolbar rb'
  const fullscreen = document.createElement('span')
  fullscreen.id = 'fullscreen'
  fullscreen.onclick = () => {
    record.nativeFullscreenCalls += 1
  }
  const center = document.createElement('span')
  center.id = 'toCenter'
  center.onclick = () => {
    record.toolbarCenterCalls += 1
  }
  toolbar.append(fullscreen, center)
  record.el.append(toolbar)
  record.toolbarFullscreen = fullscreen
}

/** A controllable fake mind map: operations are recorded, nothing renders. */
export function stubVendor(records: StubMap[]): MindmapVendor {
  return {
    parse: (body) => ({ ok: true, data: { body }, extra: {} }),
    serialize: (data) => String((data as { current?: string }).current ?? ''),
    create: (options) => {
      const record = newStubMap(options)
      records.push(record)
      installToolbarStub(record)
      return stubHandle(record)
    },
  }
}

function newStubMap(options: MindmapCreateOptions): StubMap {
  return {
    el: options.el,
    options,
    current: String((options.data as { body?: string }).body ?? ''),
    refreshes: [],
    historyCleared: false,
    destroyed: false,
    focusCalls: 0,
    layoutCalls: 0,
    fitCalls: 0,
    toolbarFullscreen: null,
    nativeFullscreenCalls: 0,
    toolbarCenterCalls: 0,
  }
}

/** The handle the registry drives; every call is recorded on `record`. */
function stubHandle(record: StubMap): MindmapHandle {
  return {
    getData: () => ({ current: record.current }),
    refresh: (data) => {
      record.refreshes.push(data)
      record.current = String((data as { body?: string }).body ?? '')
    },
    toCenter: () => {},
    layout: () => {
      record.layoutCalls += 1
    },
    scaleFit: () => {
      record.fitCalls += 1
    },
    focus: () => {
      record.focusCalls += 1
    },
    undo: () => {},
    redo: () => {},
    clearHistory: () => {
      record.historyCleared = true
    },
    destroy: () => {
      record.destroyed = true
    },
    exportSvg: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }),
    exportPng: async () => null,
  }
}

export function noteSource(body: string): string {
  return ['# Title', '', '```mindmap', body, '```', '', 'tail'].join('\n')
}

function paint(host: HTMLElement, source: string): void {
  host.innerHTML = renderMarkdown(source).html
}

/** A mounted preview surface backed by `stubVendor`; `mount` replays a re-render. */
export function scopeHarness(
  source: string,
  options: { editable?: boolean; writeBack?: (ref: MindmapFenceRef, next: string) => MindmapWriteResult } = {},
) {
  const records: StubMap[] = []
  const host = document.createElement('div')
  document.body.append(host)
  paint(host, source)
  const mounts: string[] = []
  const mount = async (next: string, overrides: Partial<Parameters<typeof mountMindmaps>[1]> = {}) => {
    paint(host, next)
    await mountMindmaps(host, {
      scope: 'scope-a',
      noteId: 'note-1',
      dark: false,
      locale: 'en-US',
      editable: options.editable ?? true,
      writeBack: options.writeBack,
      loadVendor: async () => stubVendor(records),
      ...overrides,
    })
    mounts.push(next)
  }
  return { host, records, mount, dispose: () => host.remove() }
}

/**
 * jsdom has no ResizeObserver; the stub records deliveries so a test can fire
 * the entries a real browser produces when the pane resizes.
 */
export function installResizeObserverStub(): { callback: ResizeObserverCallback; observer: ResizeObserver }[] {
  const deliveries: { callback: ResizeObserverCallback; observer: ResizeObserver }[] = []
  class ResizeObserverStub {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
      deliveries.push({ callback, observer: this as unknown as ResizeObserver })
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  return deliveries
}

export function deliverResize(delivery: { callback: ResizeObserverCallback; observer: ResizeObserver }, canvas: HTMLElement, width: number, height: number): void {
  delivery.callback(
    [{ target: canvas, contentRect: { width, height } } as unknown as ResizeObserverEntry],
    delivery.observer,
  )
}

/**
 * A loader held open until `release` resolves it with the harness's stub vendor:
 * drives the overlapping-mount-pass scenarios that need a mount spanning awaits.
 */
export function deferredVendorLoader(records: StubMap[]): { load: () => Promise<MindmapVendor>; release: () => void } {
  let release: () => void = () => {}
  const load = () => new Promise<MindmapVendor>((resolve) => { release = () => resolve(stubVendor(records)) })
  return { load, release: () => release() }
}
