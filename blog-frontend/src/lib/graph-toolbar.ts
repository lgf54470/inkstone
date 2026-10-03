import { t, getCurrentLocale } from './i18n'

/**
 * The toolbar a rendered diagram carries — zoom/fit for a vector Mermaid diagram,
 * the fence source behind it, and an image export (SVG for Mermaid, PNG for Chart.js).
 * Adapted from the root app's features/preview/graph-block-toolbar.ts; unlike the
 * editor surface this one never writes the post, it is a reading aid only.
 */

type GraphKind = 'mermaid' | 'chart'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4]

const ICONS = {
  zoomIn: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4.5-4.5"/></svg>',
  zoomOut: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4.5-4.5"/></svg>',
  fit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  source: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18l-6-6 6-6M15 6l6 6-6 6"/></svg>',
  export: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
}

function decodedSource(block: HTMLElement, kind: GraphKind): string {
  const raw = kind === 'mermaid' ? block.dataset.mermaid : block.dataset.chart
  return raw === undefined ? '' : decodeURIComponent(raw)
}

function toolButton(action: string, label: string, icon: string): string {
  return `<button type="button" class="block-tool-btn" data-graph-action="${action}" title="${label}" aria-label="${label}">${icon}</button>`
}

function renderHeadHtml(kind: GraphKind): string {
  const zoomable = kind === 'mermaid'
  const title = kind === 'mermaid'
    ? t('interactive.graph_mermaid', {}, getCurrentLocale())
    : t('interactive.graph_chart', {}, getCurrentLocale())
  const labels = {
    zoomIn: t('interactive.graph_zoom_in', {}, getCurrentLocale()),
    zoomOut: t('interactive.graph_zoom_out', {}, getCurrentLocale()),
    fit: t('interactive.graph_fit', {}, getCurrentLocale()),
    source: t('interactive.graph_source', {}, getCurrentLocale()),
    exportImage: t('interactive.graph_export', {}, getCurrentLocale()),
  }
  return [
    `<div class="block-head">`,
    `<span class="block-head-title">${title}</span>`,
    `<span class="block-tools">`,
    zoomable ? toolButton('zoom-in', labels.zoomIn, ICONS.zoomIn) : '',
    zoomable ? toolButton('zoom-out', labels.zoomOut, ICONS.zoomOut) : '',
    zoomable ? toolButton('fit', labels.fit, ICONS.fit) : '',
    toolButton('toggle-source', labels.source, ICONS.source),
    toolButton('export-image', labels.exportImage, ICONS.export),
    `</span>`,
    `</div>`,
  ].join('')
}

function renderSourcePanel(block: HTMLElement, kind: GraphKind): HTMLElement {
  const panel = document.createElement('pre')
  panel.className = 'graph-block-source'
  panel.dataset.graphSource = '1'
  panel.hidden = true
  const code = document.createElement('code')
  code.textContent = decodedSource(block, kind)
  panel.appendChild(code)
  return panel
}

function wrapGraphBlock(block: HTMLElement, kind: GraphKind): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'graph-block'
  wrapper.dataset.graphBlock = kind
  block.replaceWith(wrapper)
  wrapper.appendChild(block)
  wrapper.insertAdjacentHTML('afterbegin', renderHeadHtml(kind))
  wrapper.insertBefore(renderSourcePanel(block, kind), block)
  return wrapper
}

/** Wraps every diagram block once; called on init and harmless on repeated passes. */
export function enhanceGraphBlockToolbars(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-mermaid], [data-chart]').forEach((block) => {
    if (block.closest('[data-graph-block]')) return
    if (block.parentElement?.matches('[data-graph-block]')) return
    const kind: GraphKind = block.hasAttribute('data-chart') ? 'chart' : 'mermaid'
    block.classList.add('graph-block-body')
    wrapGraphBlock(block, kind)
  })
}

function graphOf(element: HTMLElement): { wrapper: HTMLElement; block: HTMLElement; kind: GraphKind } | null {
  const wrapper = element.closest<HTMLElement>('[data-graph-block]')
  const block = wrapper?.querySelector<HTMLElement>('[data-mermaid], [data-chart]') ?? null
  if (!wrapper || !block) return null
  return { wrapper, block, kind: wrapper.dataset.graphBlock === 'chart' ? 'chart' : 'mermaid' }
}

function zoomedScale(wrapper: HTMLElement, direction: 1 | -1): number {
  const current = Number(wrapper.dataset.graphZoom) || 1
  const index = ZOOM_STEPS.findIndex((step) => step === current)
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? 2 : index) + direction))]
  return next ?? 1
}

function applyZoom(wrapper: HTMLElement, block: HTMLElement, scale: number | null): void {
  const svg = block.querySelector<SVGElement>('svg')
  if (!svg) return
  if (scale === null || scale === 1) {
    svg.style.removeProperty('transform')
    svg.style.removeProperty('transform-origin')
    delete wrapper.dataset.graphZoom
    wrapper.dataset.graphZoomed = 'false'
    return
  }
  svg.style.transformOrigin = 'top center'
  svg.style.transform = `scale(${scale})`
  wrapper.dataset.graphZoom = String(scale)
  wrapper.dataset.graphZoomed = 'true'
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportSvg(block: HTMLElement): void {
  const svg = block.querySelector<SVGSVGElement>('svg')
  if (!svg) return
  const markup = new XMLSerializer().serializeToString(svg)
  downloadBlob('inkstone-mermaid.svg', new Blob([markup], { type: 'image/svg+xml' }))
}

function exportPng(block: HTMLElement): void {
  const canvas = block.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (blob) downloadBlob('inkstone-chart.png', blob)
  }, 'image/png')
}

function toggleSource(wrapper: HTMLElement, trigger: HTMLElement): void {
  const panel = wrapper.querySelector<HTMLElement>('[data-graph-source]')
  const open = panel?.hasAttribute('hidden') ?? false
  panel?.toggleAttribute('hidden', !open)
  trigger.setAttribute('aria-pressed', String(open))
}

export function executeGraphBlockAction(action: string, targetEl: HTMLElement): boolean {
  const graph = graphOf(targetEl)
  if (!graph) return false
  if (action === 'zoom-in') applyZoom(graph.wrapper, graph.block, zoomedScale(graph.wrapper, 1))
  else if (action === 'zoom-out') applyZoom(graph.wrapper, graph.block, zoomedScale(graph.wrapper, -1))
  else if (action === 'fit') applyZoom(graph.wrapper, graph.block, null)
  else if (action === 'toggle-source') toggleSource(graph.wrapper, targetEl)
  else if (action === 'export-image') {
    if (graph.kind === 'mermaid') exportSvg(graph.block)
    else exportPng(graph.block)
  }
  else return false
  return true
}
