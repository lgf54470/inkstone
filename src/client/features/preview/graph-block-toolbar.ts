import { escapeHtml } from '@shared/escape'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { escapeAttr } from '../../lib/markdown/renderer'
import { downloadBlob } from '../../lib/export-note'
import { t } from '../../lib/i18n'
import type { BlockToolbarModule, BlockToast } from './block-overlay'

/**
 * The toolbar a rendered diagram carries: zoom and fit for a vector diagram, the fence source behind
 * it, and an image export. Unlike the other block toolbars this one writes nothing to the note — a
 * zoom level is a reading aid, and the theme a diagram draws with is the account's, not the note's.
 */

type GraphKind = 'mermaid' | 'chart'

interface GraphBlock {
  wrapper: HTMLElement
  block: HTMLElement
  kind: GraphKind
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
const GRAPH_BLOCKS = '[data-graph-block]'

function decodedSource(block: HTMLElement, kind: GraphKind): string {
  const raw = kind === 'mermaid' ? block.dataset.mermaid : block.dataset.chart
  return raw === undefined ? '' : decodeDataValue(raw)
}

function graphOf(element: HTMLElement): GraphBlock | null {
  const wrapper = element.closest<HTMLElement>(GRAPH_BLOCKS)
  const block = wrapper?.querySelector<HTMLElement>('[data-mermaid], [data-chart]') ?? null
  if (!wrapper || !block) return null
  return { wrapper, block, kind: wrapper.dataset.graphBlock === 'chart' ? 'chart' : 'mermaid' }
}

function toolButton(action: string, label: string, icon: string): string {
  const name = escapeAttr(label)
  return `<button type="button" class="block-tool-btn" data-graph-action="${action}" title="${name}" aria-label="${name}">${icon}</button>`
}

const ICONS = {
  zoomIn: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4.5-4.5"/></svg>',
  zoomOut: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4.5-4.5"/></svg>',
  fit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  source: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18l-6-6 6-6M15 6l6 6-6 6"/></svg>',
  export: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
}

function renderHeadHtml(kind: GraphKind): string {
  const zoomable = kind === 'mermaid'
  const badge = toolButton('toggle-source', t('preview.graph_source'), ICONS.source)
  return [
    `<div class="graph-block-head">`,
    `<span class="graph-block-title">${escapeHtml(kind === 'mermaid' ? t('preview.graph_mermaid') : t('preview.graph_chart'))}</span>`,
    `<span class="block-tools">`,
    zoomable ? toolButton('zoom-in', t('preview.graph_zoom_in'), ICONS.zoomIn) : '',
    zoomable ? toolButton('zoom-out', t('preview.graph_zoom_out'), ICONS.zoomOut) : '',
    zoomable ? toolButton('fit', t('preview.graph_fit'), ICONS.fit) : '',
    badge,
    toolButton('export-image', t('preview.graph_export'), ICONS.export),
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
  panel.append(code)
  return panel
}

function wrapGraphBlock(block: HTMLElement, kind: GraphKind): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'graph-block'
  wrapper.dataset.graphBlock = kind
  block.replaceWith(wrapper)
  wrapper.append(block)
  wrapper.insertAdjacentHTML('afterbegin', renderHeadHtml(kind))
  wrapper.insertBefore(renderSourcePanel(block, kind), block)
  return wrapper
}

export function enhanceGraphBlockToolbarsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-mermaid], [data-chart]').forEach((block) => {
    if (block.closest('.note-embed-body') || block.parentElement?.matches(GRAPH_BLOCKS)) return
    const kind: GraphKind = block.hasAttribute('data-chart') ? 'chart' : 'mermaid'
    wrapGraphBlock(block, kind)
  })
}

/** The zoom step next to the one currently applied, clamped to the ends of the ladder. */
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

function exportSvg(block: HTMLElement, toast: BlockToast): void {
  const svg = block.querySelector<SVGSVGElement>('svg')
  if (!svg) {
    toast({ title: t('preview.graph_export_empty'), tone: 'warning' })
    return
  }
  const markup = new XMLSerializer().serializeToString(svg)
  downloadBlob('inkstone-mermaid.svg', new Blob([markup], { type: 'image/svg+xml' }))
}

function exportPng(block: HTMLElement, toast: BlockToast): void {
  const canvas = block.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) {
    toast({ title: t('preview.graph_export_empty'), tone: 'warning' })
    return
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      toast({ title: t('preview.graph_export_failed'), tone: 'warning' })
      return
    }
    downloadBlob('inkstone-chart.png', blob)
  }, 'image/png')
}

function toggleSource(graph: GraphBlock): void {
  const panel = graph.wrapper.querySelector<HTMLElement>('[data-graph-source]')
  const trigger = graph.wrapper.querySelector<HTMLElement>('[data-graph-action="toggle-source"]')
  const open = panel?.hasAttribute('hidden') ?? false
  panel?.toggleAttribute('hidden', !open)
  trigger?.setAttribute('aria-pressed', String(open))
}

export function executeGraphBlockAction(action: string, targetEl: HTMLElement, toast: BlockToast): boolean {
  const graph = graphOf(targetEl)
  if (!graph) return false
  if (action === 'zoom-in') applyZoom(graph.wrapper, graph.block, zoomedScale(graph.wrapper, 1))
  else if (action === 'zoom-out') applyZoom(graph.wrapper, graph.block, zoomedScale(graph.wrapper, -1))
  else if (action === 'fit') applyZoom(graph.wrapper, graph.block, null)
  else if (action === 'toggle-source') toggleSource(graph)
  else if (action === 'export-image') {
    if (graph.kind === 'mermaid') exportSvg(graph.block, toast)
    else exportPng(graph.block, toast)
  }
  else return false
  return true
}

/** This block family's toolbar: no note writes and no overlay, so its dismiss is nothing to do. */
export const graphBlockToolbar: BlockToolbarModule = {
  enhance: enhanceGraphBlockToolbarsInRoot,
  dismiss: () => {},
  close: () => null,
  handle: (event, target, ctx) => {
    const button = target.closest<HTMLButtonElement>('[data-graph-action]')
    if (!button) return false
    event.preventDefault()
    return executeGraphBlockAction(button.dataset.graphAction!, button, ctx.api.toast)
  },
}
