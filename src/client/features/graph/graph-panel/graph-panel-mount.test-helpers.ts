import { act, createElement } from 'react'
import { vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { renderElement } from '../../../lib/test-render'
import { GraphPanel } from './index'
import { GRAPH_PREFS_PERSIST_DEBOUNCE_MS } from './use-graph-prefs'

/**
 * The panel is the surface a reader actually uses: the drawer, the header buttons and the canvas all
 * live inside one portal, and its state is written by preferences effects rather than by props. Tests
 * that need that whole wiring mount the real panel here and press the controls by their accessible
 * names; what each of them proves stays in its own file.
 */

export const panelGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: 'Work', folderColor: null, tags: [] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: 'Life', folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

const mounted: Array<{ unmount: () => void, restore: () => void }> = []

/** jsdom hands back no 2d context, so the panel would never build a layout: the painting is stubbed, the state it fills is real. */
function stubPainting(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => new Proxy({}, {
      get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}),
    }),
  })
  return () => Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
}

/** Lets the graph request that is already in flight land, which is when the canvas appears. */
export async function settleGraphPanel(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 6; tick++) await Promise.resolve()
  })
}

/** Mounts the panel with its graph already on screen. */
export async function mountGraphPanel(data: GraphResponse = panelGraph): Promise<{ close: ReturnType<typeof vi.fn> }> {
  vi.mocked(api.graph).mockResolvedValue(data)
  const restore = stubPainting()
  const close = vi.fn()
  const rendered = renderElement(createElement(GraphPanel, { onClose: close }))
  await settleGraphPanel()
  mounted.push({ unmount: rendered.unmount, restore })
  return { close }
}

export function releaseGraphPanels(): void {
  while (mounted.length) {
    const entry = mounted.pop()!
    entry.unmount()
    entry.restore()
  }
}

function surface(): HTMLElement {
  const panel = document.body.querySelector<HTMLElement>('[data-surface="graph"]')
  if (!panel) throw new Error('the graph panel is not on screen')
  return panel
}

export function panelCanvas(): HTMLCanvasElement | null {
  return surface().querySelector('canvas')
}

export function panelButton(name: string): HTMLButtonElement {
  const button = Array.from(surface().querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === name)
  if (!button) throw new Error(`the graph panel has no button named ${name}`)
  return button
}

/** A control whose accessible name is the words it draws, which is how an empty state offers its way out. */
export function panelTextButton(text: string): HTMLButtonElement | null {
  return Array.from(surface().querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === text) ?? null
}

export function panelInput(label: string): HTMLInputElement {
  const input = surface().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (!input) throw new Error(`the graph panel has no input named ${label}`)
  return input
}

/** Text as a reader types it, so React owns the value the same way it does in the browser. */
export function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** The search box is debounced, so a case that waits for what it decided has to wait for that timer too. */
export async function waitQueryDebounce(ms = 320): Promise<void> {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, ms)) })
  await settleGraphPanel()
}

export function panelStatusText(marker: string): string | null {
  return surface().querySelector(`[data-graph-${marker}='']`)?.textContent ?? null
}

/** A legend row, named by the filter line it stands for. */
export function legendRow(query: string): HTMLButtonElement {
  const row = Array.from(surface().querySelectorAll<HTMLButtonElement>('button[data-legend-query]'))
    .find((button) => button.getAttribute('data-legend-query') === query)
  if (!row) throw new Error(`the graph panel draws no legend row for ${query}`)
  return row
}

/** One of the overlays the canvas paints its own text into, found by the marker it carries. */
export function panelOverlay(selector: string): HTMLElement {
  const element = surface().querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`the graph panel draws no ${selector} overlay`)
  return element
}

/** The `q` each graph request carried, in the order the panel sent them. */
export function searchRequestQueries(): Array<string | undefined> {
  return vi.mocked(api.graph).mock.calls.map((call) => call[0]?.q)
}

export function panelDrawer(label: string): HTMLElement | null {
  // The drawer is an aside on the wide layout and a dialog over the canvas on the phone one (G-25).
  return surface().querySelector<HTMLElement>(`aside[aria-label="${label}"], [role="dialog"][aria-label="${label}"], [role="region"][aria-label="${label}"]`)
}

export function panelSwitch(label: string): HTMLButtonElement {
  const control = surface().querySelector<HTMLButtonElement>(`button[role='switch'][aria-label="${label}"]`)
  if (!control) throw new Error(`the graph settings have no switch named ${label}`)
  return control
}

/**
 * The sliders and dropdowns are labelled either by the text wrapped around them or by an `aria-label`
 * the component itself carries — the force sliders went to the component library's `Slider`, which
 * names the control rather than wrapping it (G-32). Both are the accessible name, so both find it.
 */
function labelledControl<T extends HTMLElement>(selector: string, label: string): T {
  const control = Array.from(surface().querySelectorAll<T>(selector))
    .find((candidate) => candidate.getAttribute('aria-label') === label || candidate.closest('label')?.textContent?.includes(label))
  if (!control) throw new Error(`the graph settings have no control named ${label}`)
  return control
}

export function panelRange(label: string): HTMLInputElement {
  return labelledControl<HTMLInputElement>('[type="range"]', label)
}

export function panelSelect(label: string): HTMLSelectElement {
  return labelledControl<HTMLSelectElement>('select', label)
}

/** React only sees a value the browser itself wrote, so a test types through the native setter. */
export function setRangeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export function selectOption(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

export function click(element: HTMLElement): void {
  act(() => { element.click() })
}

/** One step along a slider's track, without letting go of the handle. */
export function stepRange(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Letting go: the boundary where a slider's own number becomes the panel's preference (G-11). */
export function releaseRange(input: HTMLInputElement): void {
  act(() => { input.dispatchEvent(new Event('pointerup', { bubbles: true })) })
}

/** A gesture the browser takes back — a touch that turns into a scroll — which still decides the value. */
export function cancelRange(input: HTMLInputElement): void {
  act(() => { input.dispatchEvent(new Event('pointercancel', { bubbles: true })) })
}

/**
 * A slider drag as a reader makes it: the steps along the track, then the release that decides the
 * value. jsdom has no `PointerEvent`, and React only needs the event to arrive with the same name.
 */
export function dragRange(input: HTMLInputElement, ...values: string[]): void {
  for (const value of values) stepRange(input, value)
  releaseRange(input)
}

/** How long a committed preference takes to reach storage; a case that reads it back has to wait that out. */
export async function settlePersist(): Promise<void> {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, GRAPH_PREFS_PERSIST_DEBOUNCE_MS + 60)) })
}

/** Escape as a reader presses it: from whatever the dialog holds focus on. */
export function pressEscape(target?: Element): KeyboardEvent {
  const focused = target ?? (document.activeElement instanceof Element ? document.activeElement : document.body)
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => { focused.dispatchEvent(event) })
  return event
}
