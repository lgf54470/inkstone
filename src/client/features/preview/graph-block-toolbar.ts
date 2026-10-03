import { escapeHtml } from '@shared/escape'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { fenceBody } from '../../lib/markdown/fence-bodies'
import { escapeAttr } from '../../lib/markdown/renderer'
import { applyChartBodyAtFence, chartFenceAt, convertChartBody, detectChartMode, type ChartConvertFailure, type ChartMode } from '../../lib/markdown/chart'
import { downloadBlob } from '../../lib/export-note'
import { t, type MessageKey } from '../../lib/i18n'
import { blockActionSource } from './block-overlay'
import type { BlockToolbarModule, BlockToast } from './block-overlay'

/**
 * The toolbar a rendered diagram carries: zoom and fit for a vector diagram, the fence source behind
 * it, and an image export. Unlike the other block toolbars this one writes nothing to the note — a
 * zoom level is a reading aid, and the theme a diagram draws with is the account's, not the note's.
 */

type GraphKind = 'mermaid' | 'chart' | 'echarts'

interface GraphBlock {
  wrapper: HTMLElement
  block: HTMLElement
  kind: GraphKind
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
const GRAPH_BLOCKS = '[data-graph-block]'

/** Where a block's own source lives: an attribute for the two that carry it there, the document's
 * fence-body set for the one that does not. */
function decodedSource(block: HTMLElement, kind: GraphKind): string {
  if (kind === 'mermaid') return decodeDataValue(block.dataset.mermaid ?? '')
  if (kind === 'chart') return decodeDataValue(block.dataset.chart ?? '')
  const index = Number(block.dataset.echartsIndex)
  return fenceBody(block, 'echarts', Number.isInteger(index) && index >= 0 ? index : -1)
}

/** Why a body will not write the other way, in the words the author needs to act on. */
const CONVERT_MESSAGES: Record<ChartConvertFailure, MessageKey> = {
  'needs-echarts': 'markdown.chart_kind_needs_echarts',
  'unknown-kind': 'markdown.chart_kind_unknown',
  'empty-table': 'markdown.chart_table_empty',
  'too-narrow': 'markdown.chart_table_narrow',
  'bad-mapping': 'markdown.chart_mapping_column',
  'invalid-json': 'markdown.chart_convert_invalid_json',
  'table-syntax': 'markdown.chart_convert_table_syntax',
  'not-a-config': 'markdown.chart_convert_not_config',
  lossy: 'markdown.chart_convert_lossy',
}

const GRAPH_SOURCES = '[data-mermaid], [data-chart], [data-echarts]'

function graphOf(element: HTMLElement): GraphBlock | null {
  const wrapper = element.closest<HTMLElement>(GRAPH_BLOCKS)
  const block = wrapper?.querySelector<HTMLElement>(GRAPH_SOURCES) ?? null
  if (!wrapper || !block) return null
  const named = wrapper.dataset.graphBlock
  return { wrapper, block, kind: named === 'chart' || named === 'echarts' ? named : 'mermaid' }
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

/**
 * The format control. It states the format it switches *to*, so the press is never a mystery, and a
 * chart whose config holds something a table cannot carry still gets it: the refusal explains itself
 * on press rather than leaving a button that quietly never appears.
 */
function convertButton(mode: ChartMode): string {
  const target = mode === 'table' ? 'json' : 'table'
  const label = t(target === 'json' ? 'preview.graph_convert_to_json' : 'preview.graph_convert_to_table')
  return toolButton('convert-format', label, escapeHtml(t(target === 'json' ? 'preview.graph_format_json' : 'preview.graph_format_table')))
}

function renderHeadHtml(kind: GraphKind, mode: ChartMode): string {
  const zoomable = kind === 'mermaid'
  const titleKey = kind === 'mermaid' ? 'preview.graph_mermaid' : kind === 'chart' ? 'preview.graph_chart' : 'preview.graph_echarts'
  const badge = toolButton('toggle-source', t('preview.graph_source'), ICONS.source)
  return [
    `<div class="block-head">`,
    `<span class="block-head-title">${escapeHtml(t(titleKey))}</span>`,
    `<span class="block-tools">`,
    zoomable ? toolButton('zoom-in', t('preview.graph_zoom_in'), ICONS.zoomIn) : '',
    zoomable ? toolButton('zoom-out', t('preview.graph_zoom_out'), ICONS.zoomOut) : '',
    zoomable ? toolButton('fit', t('preview.graph_fit'), ICONS.fit) : '',
    kind === 'chart' ? convertButton(mode) : '',
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
  const mode = kind === 'chart' ? detectChartMode(decodedSource(block, kind)) : 'json'
  wrapper.insertAdjacentHTML('afterbegin', renderHeadHtml(kind, mode))
  wrapper.insertBefore(renderSourcePanel(block, kind), block)
  return wrapper
}

export function enhanceGraphBlockToolbarsInRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(GRAPH_SOURCES).forEach((block) => {
    if (block.closest('.note-embed-body') || block.parentElement?.matches(GRAPH_BLOCKS)) return
    const kind: GraphKind = block.hasAttribute('data-echarts') ? 'echarts' : block.hasAttribute('data-chart') ? 'chart' : 'mermaid'
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

/** An echarts block draws SVG, so it leaves the same way a diagram does: the markup, not a raster. */
function exportEcharts(block: HTMLElement, toast: BlockToast): void {
  const svg = block.querySelector<SVGSVGElement>('svg')
  if (!svg) {
    toast({ title: t('preview.graph_export_empty'), tone: 'warning' })
    return
  }
  const markup = new XMLSerializer().serializeToString(svg)
  downloadBlob('inkstone-echarts.svg', new Blob([markup], { type: 'image/svg+xml' }))
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

/**
 * Rewrites the fence as the other format. The block was drawn from the body the renderer encoded, so
 * that is what the fence is looked up by: when the note no longer holds it, nothing is written, in
 * either direction of the mistake.
 */
export function convertChartFormat(
  block: HTMLElement,
  content: string,
  onEdit: (next: string) => void,
  toast: BlockToast,
): boolean {
  const line = Number(block.dataset.line)
  if (!Number.isInteger(line) || line < 0) return declined(toast, 'preview.code_edit_unavailable')
  const fence = chartFenceAt(content, line)
  if (!fence) return declined(toast, 'preview.graph_block_moved')
  const converted = convertChartBody(fence.body)
  if (!converted.ok) return declined(toast, CONVERT_MESSAGES[converted.reason])
  const next = applyChartBodyAtFence(content, fence, converted.body)
  if (next === null) return declined(toast, 'preview.graph_block_moved')
  onEdit(next)
  return true
}

function declined(toast: BlockToast, messageKey: MessageKey): boolean {
  toast({ title: t(messageKey), tone: 'warning' })
  return true
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
    else if (graph.kind === 'echarts') exportEcharts(graph.block, toast)
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
    const action = button.dataset.graphAction!
    if (action === 'convert-format') {
      const graph = graphOf(button)
      const editable = blockActionSource(ctx)
      if (!graph || !editable) return true
      return convertChartFormat(graph.block, editable.source, (next) => ctx.api.editContent(editable.noteId, next), ctx.api.toast)
    }
    return executeGraphBlockAction(action, button, ctx.api.toast)
  },
}
