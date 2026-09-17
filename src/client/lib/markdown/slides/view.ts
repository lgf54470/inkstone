import { t } from '../../i18n'
import { decodeDataValue } from '../data-attr'
import type { SlidesFenceRef } from './types'

export const SLIDES_BLOCK_SELECTOR = '[data-bento-slides]'
export const SLIDES_PLACEHOLDER_SELECTOR = '[data-bento-slides-placeholder]'
export const SLIDES_CANVAS_CLASS = 'bento-slides-canvas'
export const SLIDES_CANVAS_SELECTOR = '[data-bento-slides-canvas]'
export const SLIDES_FULLSCREEN_CLASS = 'bento-slides-fullscreen'

const CONTROL_ICONS: Record<string, string[]> = {
  'data-bento-slides-fullscreen': ['M15 3h6v6', 'm21 3-7 7', 'm3 21 7-7', 'M9 21H3v-6'],
  'data-bento-slides-present': ['M5 3l14 9-14 9V3z'],
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

export function decorateSlidesControls(node: HTMLElement): void {
  for (const [attribute, paths] of Object.entries(CONTROL_ICONS)) {
    const button = node.querySelector<HTMLElement>(`[${attribute}]`)
    if (button && !button.querySelector('svg')) button.append(iconSvg(paths))
  }
}

export function createSlidesCanvas(editable: boolean): HTMLElement {
  const container = document.createElement('div')
  container.className = SLIDES_CANVAS_CLASS
  container.dataset.bentoSlidesCanvas = '1'
  container.setAttribute('role', 'region')
  container.setAttribute('aria-label', t('preview.slides'))
  if (!editable) container.classList.add('is-readonly')
  return container
}

export function slidesBlocks(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SLIDES_BLOCK_SELECTOR)]
}

export function slidesBody(node: HTMLElement): string {
  return decodeDataValue(node.dataset.bentoSlides ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '')
}

export function slidesIndex(node: HTMLElement): number {
  const value = Number(node.dataset.bentoSlidesIndex)
  return Number.isInteger(value) && value >= 0 ? value : 0
}

export function slidesPlaceholder(node: HTMLElement): HTMLElement | null {
  return node.querySelector<HTMLElement>(SLIDES_PLACEHOLDER_SELECTOR)
}

export function slidesFenceRef(node: HTMLElement): SlidesFenceRef | null {
  const raw = node.dataset.line
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  return { line: Number(raw), body: slidesBody(node) }
}

export function isSlidesWritableHere(node: HTMLElement): boolean {
  return Boolean(slidesFenceRef(node)) && !node.closest('.note-embed-body, .markdown-example-preview')
}

export function markSlidesLoading(node: HTMLElement): void {
  node.classList.add('loading')
  node.classList.remove('is-ready', 'has-error', 'slides-source')
  node.setAttribute('aria-busy', 'true')
}

export function markSlidesReady(node: HTMLElement): void {
  node.classList.remove('loading', 'has-error', 'slides-source')
  node.classList.add('is-ready')
  node.setAttribute('aria-busy', 'false')
}

export function showSlidesError(node: HTMLElement, detail: string): void {
  node.classList.remove('loading', 'is-ready')
  node.classList.add('has-error')
  node.setAttribute('aria-busy', 'false')
  const placeholder = slidesPlaceholder(node) ?? node
  const wrap = document.createElement('div')
  wrap.className = 'bento-slides-error'
  const message = document.createElement('span')
  message.className = 'bento-slides-error-message'
  message.textContent = `${t('preview.slides_render_failed')}: ${detail.slice(0, 500)}`
  wrap.append(message)
  placeholder.replaceChildren(wrap)
}
