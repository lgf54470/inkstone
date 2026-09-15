/**
 * DOM helpers for whiteboard blocks: reading what the renderer emitted into a
 * placeholder, and the two degraded states (source fallback, error banner). These are
 * the only paths that touch the block markup, so the mount pass and the preview
 * interaction handlers stay in sync on the contract.
 */
import { t } from '../../i18n'
import { decodeDataValue } from '../data-attr'
import type { ExcalidrawFenceRef } from './types'

export const EXCALIDRAW_BLOCK_SELECTOR = '[data-excalidraw]'
export const EXCALIDRAW_PLACEHOLDER_SELECTOR = '[data-excalidraw-placeholder]'
export const EXCALIDRAW_CANVAS_CLASS = 'excalidraw-canvas'
export const EXCALIDRAW_CANVAS_SELECTOR = '[data-excalidraw-canvas]'
export const EXCALIDRAW_FULLSCREEN_CLASS = 'excalidraw-fullscreen'

/** The library picker's own icon (lucide's library), used by the block header button. */
const EXCALIDRAW_LIBRARY_ICON: readonly string[] = ['m16 6 4 14', 'M12 6v14', 'M8 8v12', 'M4 4v16']

/**
 * The block's header buttons ship as empty markup because the sanitizer keeps SVG out
 * of the prose whitelist, so their icons are appended as DOM nodes here. Path data:
 * lucide's library, expand and maximize-2, the same shapes a mind map block's header
 * carries.
 */
const CONTROL_ICONS: Record<string, string[]> = {
  'data-excalidraw-library': [...EXCALIDRAW_LIBRARY_ICON],
  'data-excalidraw-fit': ['m15 15 6 6', 'm15 9 6-6', 'M21 16v5h-5', 'M21 8V3h-5', 'M3 16v5h5', 'm3 21 6-6', 'M3 8V3h5', 'M9 9 3 3'],
  'data-excalidraw-fullscreen': ['M15 3h6v6', 'm21 3-7 7', 'm3 21 7-7', 'M9 21H3v-6'],
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function iconSvg(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  for (const data of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', data)
    svg.append(path)
  }
  return svg
}

/** Adds the header icons to a freshly rendered block; a no-op on later passes. */
export function decorateExcalidrawControls(node: HTMLElement): void {
  for (const [attribute, paths] of Object.entries(CONTROL_ICONS)) {
    const button = node.querySelector<HTMLElement>(`[${attribute}]`)
    if (button && !button.querySelector('svg')) button.append(iconSvg(paths))
  }
}

/** The element the board draws in; the library owns its own focusable surface inside it. */
export function createExcalidrawCanvas(editable: boolean): HTMLElement {
  const container = document.createElement('div')
  container.className = EXCALIDRAW_CANVAS_CLASS
  container.dataset.excalidrawCanvas = '1'
  container.setAttribute('role', 'application')
  container.setAttribute('aria-label', t('preview.excalidraw'))
  if (!editable) container.classList.add('is-readonly')
  return container
}

export function excalidrawBlocks(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(EXCALIDRAW_BLOCK_SELECTOR)]
}

/**
 * A surface the board answers for itself: its canvas, or the full screen room it is moved
 * into. Both bring the library's own right-click menu, so the note's menu opening there
 * too would leave two of them stacked on one click.
 */
export function isExcalidrawSurface(target: HTMLElement | null): boolean {
  return Boolean(target?.closest(`${EXCALIDRAW_CANVAS_SELECTOR}, .${EXCALIDRAW_FULLSCREEN_CLASS}`))
}

/**
 * The block's canonical body: markdown-it reports fence content with the final line
 * feed, while the note stores body lines joined without one. Everything that compares
 * bodies (write-back, source sync) goes through here so both sides agree.
 */
export function excalidrawBody(node: HTMLElement): string {
  return decodeDataValue(node.dataset.excalidraw).replace(/\r\n/g, '\n').replace(/\n$/, '')
}

export function excalidrawIndex(node: HTMLElement): number {
  const value = Number(node.dataset.excalidrawIndex)
  return Number.isInteger(value) && value >= 0 ? value : 0
}

export function excalidrawPlaceholder(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(EXCALIDRAW_PLACEHOLDER_SELECTOR)
}

/** The fence this block mirrors, or null when writing back would be unsafe. */
export function excalidrawFenceRef(node: HTMLElement): ExcalidrawFenceRef | null {
  const raw = node.dataset.line
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  return { line: Number(raw), body: excalidrawBody(node) }
}

/**
 * Nested renders (an embedded note, a markdown example) carry a `data-line` that points
 * into *their* source, so writing back from there would corrupt the note that is open.
 * Those blocks stay on their source.
 */
export function isExcalidrawWritableHere(node: HTMLElement): boolean {
  return Boolean(excalidrawFenceRef(node)) && !node.closest('.note-embed-body, .markdown-example-preview')
}

export function markExcalidrawLoading(node: HTMLElement): void {
  node.classList.add('loading')
  node.classList.remove('is-ready', 'has-error', 'excalidraw-source')
  node.setAttribute('aria-busy', 'true')
}

export function markExcalidrawReady(node: HTMLElement): void {
  node.classList.remove('loading', 'has-error', 'excalidraw-source')
  node.classList.add('is-ready')
  node.setAttribute('aria-busy', 'false')
}

function removeHeadControls(node: HTMLElement): void {
  node.querySelectorAll<HTMLElement>('[data-excalidraw-fullscreen], [data-excalidraw-fit], [data-excalidraw-library]').forEach((control) => control.remove())
}

/** Fallback where a live board cannot run: show the scene, drop the inert controls. */
export function showExcalidrawSource(node: HTMLElement): void {
  removeHeadControls(node)
  node.classList.remove('loading', 'has-error', 'is-ready')
  node.classList.add('excalidraw-source')
  node.setAttribute('aria-busy', 'false')
  const placeholder = excalidrawPlaceholder(node) ?? node
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = excalidrawBody(node)
  pre.append(code)
  placeholder.replaceChildren(pre)
}

/** Fallback for every surface that knows nothing about whiteboards: show the scene. */
export function showExcalidrawSourceAll(root: ParentNode): void {
  for (const node of excalidrawBlocks(root)) showExcalidrawSource(node)
}

export function showExcalidrawError(node: HTMLElement, detail: string): void {
  removeHeadControls(node)
  node.classList.remove('loading', 'is-ready')
  node.classList.add('has-error')
  node.setAttribute('aria-busy', 'false')
  const placeholder = excalidrawPlaceholder(node) ?? node
  const wrap = document.createElement('div')
  wrap.className = 'excalidraw-error'
  const message = document.createElement('span')
  message.className = 'excalidraw-error-message'
  message.textContent = `${t('preview.excalidraw_render_failed')}: ${detail.slice(0, 500)}`
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'excalidraw-retry'
  retry.dataset.excalidrawRetry = '1'
  retry.textContent = t('common.retry')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = excalidrawBody(node)
  pre.append(code)
  wrap.append(message, retry, pre)
  placeholder.replaceChildren(wrap)
}
