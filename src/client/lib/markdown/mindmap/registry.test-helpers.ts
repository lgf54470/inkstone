import { vi } from 'vitest'
import { registerFenceBodies } from '../fence-bodies'
import { renderMarkdown } from '../renderer'
import { mountMindmaps } from './registry'
import { APP_THEME_CHOICE, type MindmapThemeChoice } from './theme'
import type { MindmapCreateOptions, MindmapFenceWriter, MindmapHandle, MindmapParsedBody, MindmapThemeInput, MindmapVendor, MindmapWriter } from './types'

export interface StubMap {
  el: HTMLElement
  options: MindmapCreateOptions
  current: string
  /** The parsed bodies a fence edit loaded into the instance, oldest first. */
  refreshes: MindmapParsedBody[]
  /** Palettes handed to a live instance through applyTheme, oldest first. */
  paints: MindmapThemeInput[]
  historyCleared: boolean
  destroyed: boolean
  focusCalls: number
  layoutCalls: number
  fitCalls: number
  /**
   * The drawing calls that measure the map, with whether its element was in the document
   * when they were made. The library reads node boxes and its own width, so a call taken
   * while the element is out of the document measures zero — the real library draws NaN
   * connectors from that, which is why the order of re-parenting and refreshing is a
   * contract and not an implementation detail.
   */
  measuredWhileAttached: { call: 'refresh' | 'layout' | 'toCenter' | 'scaleFit'; connected: boolean }[]
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
export function stubVendor(records: StubMap[], theme: MindmapThemeChoice | (() => MindmapThemeChoice) = APP_THEME_CHOICE): MindmapVendor {
  // The real vendor reads the palette out of the fence; the stub is told. A getter is
  // what lets a test replay a fence edit that names another palette on a live instance.
  const readTheme = typeof theme === 'function' ? theme : () => theme
  return {
    parse: (body) => ({ ok: true, data: { body }, extra: {}, theme: readTheme() }),
    // Faithful to the real pair in shape: outline mode writes the line format back, JSON
    // mode carries the fields the outline format has nowhere to put (theme included).
    serialize: (data, mode, extra) => (mode === 'json'
      ? JSON.stringify({ ...extra, ...(data as Record<string, unknown>) }, null, 2)
      : String((data as { current?: string }).current ?? '')),
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
    current: String((options.body.data as { body?: string }).body ?? ''),
    refreshes: [],
    paints: [],
    historyCleared: false,
    destroyed: false,
    focusCalls: 0,
    layoutCalls: 0,
    fitCalls: 0,
    measuredWhileAttached: [],
    toolbarFullscreen: null,
    nativeFullscreenCalls: 0,
    toolbarCenterCalls: 0,
  }
}

/** The handle the registry drives; every call is recorded on `record`. */
function stubHandle(record: StubMap): MindmapHandle {
  return {
    getData: () => ({ current: record.current }),
    refresh: (body) => {
      record.measuredWhileAttached.push({ call: 'refresh', connected: record.el.isConnected })
      record.refreshes.push(body)
      record.current = String((body.data as { body?: string }).body ?? '')
    },
    applyTheme: (theme) => {
      record.paints.push(theme)
    },
    toCenter: () => {
      record.measuredWhileAttached.push({ call: 'toCenter', connected: record.el.isConnected })
    },
    layout: () => {
      record.measuredWhileAttached.push({ call: 'layout', connected: record.el.isConnected })
      record.layoutCalls += 1
    },
    scaleFit: () => {
      record.measuredWhileAttached.push({ call: 'scaleFit', connected: record.el.isConnected })
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

/** `annotation` lands in the fence's info string: ` ```mindmap theme=dark `. */
export function noteSource(body: string, annotation?: string): string {
  return ['# Title', '', `\`\`\`mindmap${annotation === undefined ? '' : ` ${annotation}`}`, body, '```', '', 'tail'].join('\n')
}

function paint(host: HTMLElement, source: string): void {
  const rendered = renderMarkdown(source)
  host.innerHTML = rendered.html
  // A re-render replaces the markup, so the host carries the set this markup was rendered from: the
  // body no longer rides inside the block's own attribute (P-01).
  registerFenceBodies(host, rendered.fences)
}

/** A mounted preview surface backed by `stubVendor`; `mount` replays a re-render. */
export function scopeHarness(
  source: string,
  options: {
    editable?: boolean
    writeBack?: MindmapWriter
    /** How this surface rewrites a fence for its header control, when a test drives one. */
    writeFence?: MindmapFenceWriter
    /** What this surface's bodies parse to (the vendor reads the fence; the stub is told). */
    theme?: MindmapThemeChoice
  } = {},
) {
  const records: StubMap[] = []
  const host = document.createElement('div')
  document.body.append(host)
  paint(host, source)
  const mounts: string[] = []
  let parsedTheme: MindmapThemeChoice = options.theme ?? APP_THEME_CHOICE
  const mount = async (next: string, overrides: Partial<Parameters<typeof mountMindmaps>[1]> = {}) => {
    paint(host, next)
    await mountMindmaps(host, {
      scope: 'scope-a',
      noteId: 'note-1',
      dark: false,
      locale: 'en-US',
      editable: options.editable ?? true,
      writeBack: options.writeBack,
      writeFence: options.writeFence,
      loadVendor: async () => stubVendor(records, () => parsedTheme),
      ...overrides,
    })
    mounts.push(next)
  }
  return {
    host,
    records,
    mount,
    /** What the next parse of this surface's bodies reports, as a fence edit would. */
    setBodyTheme: (theme: MindmapThemeChoice) => {
      parsedTheme = theme
    },
    dispose: () => host.remove(),
  }
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
