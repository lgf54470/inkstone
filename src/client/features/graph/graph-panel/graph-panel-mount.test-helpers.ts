import { act, createElement } from 'react'
import { vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { renderElement } from '../../../lib/test-render'
import { GraphPanel } from './index'

/**
 * The panel is the surface a reader actually uses: the drawer, the header buttons and the canvas all
 * live inside one portal, and its state is written by preferences effects rather than by props. Tests
 * that need that whole wiring mount the real panel here and press the controls by their accessible
 * names; what each of them proves stays in its own file.
 */

export const panelGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Life', folderColor: null, tags: [] },
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

export function panelDrawer(label: string): HTMLElement | null {
  return surface().querySelector<HTMLElement>(`aside[aria-label="${label}"]`)
}

export function panelSwitch(label: string): HTMLButtonElement {
  const control = surface().querySelector<HTMLButtonElement>(`button[role='switch'][aria-label="${label}"]`)
  if (!control) throw new Error(`the graph settings have no switch named ${label}`)
  return control
}

/** The sliders and dropdowns are labelled by the text wrapped around them, not by an attribute. */
function labelledControl<T extends HTMLElement>(selector: string, label: string): T {
  const control = Array.from(surface().querySelectorAll<T>(selector))
    .find((candidate) => candidate.closest('label')?.textContent?.includes(label))
  if (!control) throw new Error(`the graph settings have no control labelled ${label}`)
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

/** Escape as a reader presses it: from whatever the dialog holds focus on. */
export function pressEscape(target?: Element): KeyboardEvent {
  const focused = target ?? (document.activeElement instanceof Element ? document.activeElement : document.body)
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => { focused.dispatchEvent(event) })
  return event
}
