/**
 * DOM helpers for mind map blocks: reading what the renderer emitted into a
 * placeholder, and the two degraded states (source fallback, error banner).
 * These are the only paths that touch the block markup, so the mount/static
 * renderers and the preview interaction handlers stay in sync on the contract.
 */
import { t } from '../../i18n'
import { decodeDataValue } from '../data-attr'
import { normalizeEol } from './body'
import type { MindmapFenceRef } from './types'

export const MINDMAP_BLOCK_SELECTOR = '[data-mindmap]'
export const MINDMAP_PLACEHOLDER_SELECTOR = '[data-mindmap-placeholder]'
export const MINDMAP_CANVAS_CLASS = 'mindmap-canvas'
/** The library's own toolbar button that asks the browser for native full screen. */
export const MINDMAP_NATIVE_FULLSCREEN_SELECTOR = '#fullscreen'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The block's header buttons ship as empty markup because the sanitizer keeps
 * SVG out of the prose whitelist (mXSS-prone element combinations), so their
 * icons are appended as DOM nodes here, next to the other post-sanitize
 * producers (task checkboxes, KaTeX output). Path data: lucide's expand and
 * maximize-2.
 */
const CONTROL_ICONS: Record<string, string[]> = {
  'data-mindmap-fit': ['m15 15 6 6', 'm15 9 6-6', 'M21 16v5h-5', 'M21 8V3h-5', 'M3 16v5h5', 'm3 21 6-6', 'M3 8V3h5', 'M9 9 3 3'],
  'data-mindmap-fullscreen': ['M15 3h6v6', 'm21 3-7 7', 'm3 21 7-7', 'M9 21H3v-6'],
}

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
export function decorateMindmapControls(node: HTMLElement): void {
  for (const [attribute, paths] of Object.entries(CONTROL_ICONS)) {
    const button = node.querySelector<HTMLElement>(`[${attribute}]`)
    if (button && !button.querySelector('svg')) button.append(iconSvg(paths))
  }
}

/**
 * The library's toolbar ships a full screen button that puts its canvas — not
 * the app — into the browser's own full screen. That cannot hold here: the
 * preview re-renders the note's markup on every commit, and the registry then
 * re-parents the canvas into the fresh placeholder, which detaches it and makes
 * the browser drop the full screen. Adding a sibling with Enter is enough to
 * trigger it, because the edit schedules a write. The native request is switched
 * off and the button is routed to our full screen overlay instead, which is
 * built for this view and survives the re-render; see
 * features/preview/preview-interactions.ts.
 */
export function disarmNativeFullscreen(root: ParentNode): void {
  const button = root.querySelector<HTMLElement>(MINDMAP_NATIVE_FULLSCREEN_SELECTOR)
  if (button) button.onclick = null
}

export function mindmapBlocks(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(MINDMAP_BLOCK_SELECTOR)]
}

/**
 * The block's canonical body: markdown-it reports fence content with the final
 * line feed, while the note stores body lines joined without one. Everything
 * that compares bodies (write-back, source sync) goes through here so both
 * sides agree.
 */
export function mindmapBody(node: HTMLElement): string {
  return normalizeEol(decodeDataValue(node.dataset.mindmap)).replace(/\n$/, '')
}

export function mindmapIndex(node: HTMLElement): number {
  const value = Number(node.dataset.mindmapIndex)
  return Number.isInteger(value) && value >= 0 ? value : 0
}

export function mindmapPlaceholder(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(MINDMAP_PLACEHOLDER_SELECTOR)
}

/** The fence this block mirrors, or null when writing back would be unsafe. */
export function mindmapFenceRef(node: HTMLElement): MindmapFenceRef | null {
  const raw = node.dataset.line
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  return { line: Number(raw), body: mindmapBody(node) }
}

/**
 * Nested renders (an embedded note, a markdown example) carry a `data-line`
 * that points into *their* source, so writing back from there would corrupt the
 * note that is open. Those blocks stay view-only, exactly like the task
 * checkboxes inside embedded notes.
 */
export function isMindmapWritableHere(node: HTMLElement): boolean {
  return Boolean(mindmapFenceRef(node)) && !node.closest('.note-embed-body, .markdown-example-preview')
}

/**
 * The library's inline topic editor. Its presence is the editing state, read
 * from the DOM rather than tracked from bus events: a missed event would leave a
 * stale flag and the overlay would stop closing on Escape.
 */
export function mindmapEditing(node: HTMLElement | null): boolean {
  return Boolean(node?.querySelector('#input-box'))
}

function removeHeadControls(node: HTMLElement): void {
  node.querySelectorAll<HTMLElement>('[data-mindmap-fullscreen], [data-mindmap-fit]').forEach((button) => button.remove())
}

export function markMindmapLoading(node: HTMLElement): void {
  node.classList.add('loading')
  node.classList.remove('is-ready', 'has-error', 'mindmap-source')
  node.setAttribute('aria-busy', 'true')
}

export function markMindmapReady(node: HTMLElement): void {
  node.classList.remove('loading', 'has-error', 'mindmap-source')
  node.classList.add('is-ready')
  node.setAttribute('aria-busy', 'false')
}

/** Fallback used wherever a live map cannot run: show the source, drop the inert controls. */
export function showMindmapSource(node: HTMLElement): void {
  removeHeadControls(node)
  node.classList.remove('loading', 'has-error', 'is-ready')
  node.classList.add('mindmap-source')
  node.setAttribute('aria-busy', 'false')
  const placeholder = mindmapPlaceholder(node) ?? node
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = mindmapBody(node)
  pre.append(code)
  placeholder.replaceChildren(pre)
}

export function showMindmapSourceAll(root: ParentNode): void {
  mindmapBlocks(root).forEach(showMindmapSource)
}

export function showMindmapError(node: HTMLElement, detail: string): void {
  removeHeadControls(node)
  node.classList.remove('loading', 'is-ready')
  node.classList.add('has-error')
  node.setAttribute('aria-busy', 'false')
  const placeholder = mindmapPlaceholder(node) ?? node
  const wrap = document.createElement('div')
  wrap.className = 'mindmap-error'
  const message = document.createElement('span')
  message.className = 'mindmap-error-message'
  message.textContent = `${t('preview.mindmap_render_failed')}: ${detail.slice(0, 500)}`
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'mindmap-retry'
  retry.dataset.mindmapRetry = '1'
  retry.textContent = t('common.retry')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = mindmapBody(node)
  pre.append(code)
  wrap.append(message, retry, pre)
  placeholder.replaceChildren(wrap)
}

export function resetMindmapNode(node: HTMLElement): void {
  const placeholder = mindmapPlaceholder(node) ?? node
  markMindmapLoading(node)
  placeholder.replaceChildren()
  const label = document.createElement('div')
  label.className = 'mindmap-block-status'
  label.textContent = t('preview.mindmap_loading')
  placeholder.append(label)
}
