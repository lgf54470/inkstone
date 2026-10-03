import { escapeHtml } from '@shared/escape'
import { saveImage } from '../../../lib/element-image'
import { arrowHeadPoints, drawEdges, drawLabels, drawNodes, readThemeColors } from './canvas-draw'
import { FALLBACK_FONT_FAMILY, GRAPH_EDGE_ALPHA, GRAPH_LABEL_ALPHA, GRAPH_LABEL_FONT_SIZE, GRAPH_LABEL_HALO, GRAPH_LABEL_OFFSET, GRAPH_PIN_ALPHA, GRAPH_TAG_RING_GAP, GRAPH_TAG_RING_WIDTH } from './constants'
import { graphLabelVisible, graphNodeLabel, nodeColor } from './helpers'
import type { CanvasNode, CanvasState, ThemeColors } from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'

/** Device pixels per world unit in the exported picture, so the file is sharper than the panel. */
export const GRAPH_EXPORT_SCALE = 2

/** The longest edge a raster export asks for: past this a browser hands back an empty canvas. */
export const GRAPH_EXPORT_MAX_EDGE = 4000

/** The picture is drawn at world scale, so type and line widths match the panel at zoom 1 however far the graph is fitted. */
const EXPORT_DRAW_SCALE = 1

/** Clearance around the outermost node, so a label is not cropped by the edge of the file. */
const GRAPH_EXPORT_PADDING = 24

const SVG_MIME = 'image/svg+xml;charset=utf-8'

export type GraphExportKind = 'png' | 'svg'

export interface GraphExportBounds {
  minX: number
  minY: number
  width: number
  height: number
}

export interface GraphExportGeometry {
  scale: number
  width: number
  height: number
}

export function graphExportBounds(nodes: readonly CanvasNode[], labels: boolean): GraphExportBounds {
  if (!nodes.length) return { minX: 0, minY: 0, width: GRAPH_EXPORT_PADDING * 2, height: GRAPH_EXPORT_PADDING * 2 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodes) {
    const label = labels && graphLabelVisible(node, EXPORT_DRAW_SCALE) ? GRAPH_LABEL_FONT_SIZE + GRAPH_LABEL_OFFSET : 0
    minX = Math.min(minX, node.x - node.r)
    maxX = Math.max(maxX, node.x + node.r)
    minY = Math.min(minY, node.y - node.r)
    maxY = Math.max(maxY, node.y + node.r + label)
  }
  return {
    minX: minX - GRAPH_EXPORT_PADDING,
    minY: minY - GRAPH_EXPORT_PADDING,
    width: maxX - minX + GRAPH_EXPORT_PADDING * 2,
    height: maxY - minY + GRAPH_EXPORT_PADDING * 2,
  }
}

/** The canvas the picture needs: two device pixels per world unit, unless the whole graph would not fit. */
export function graphExportGeometry(bounds: GraphExportBounds): GraphExportGeometry {
  const scale = Math.min(GRAPH_EXPORT_SCALE, GRAPH_EXPORT_MAX_EDGE / Math.max(1, bounds.width, bounds.height))
  return {
    scale,
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  }
}

export function graphExportFilename(mode: GraphPreferences['mode'], kind: GraphExportKind): string {
  return `graph-${mode}.${kind}`
}

export function readGraphExportFont(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || FALLBACK_FONT_FAMILY
}

export function graphExportSvg(
  state: CanvasState,
  colors: ThemeColors,
  prefs: GraphPreferences,
  fontFamily: string,
): string {
  const titles = exportTitles(prefs)
  const bounds = graphExportBounds(state.nodes, titles)
  const box = `${num(bounds.minX)} ${num(bounds.minY)} ${num(bounds.width)} ${num(bounds.height)}`
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(bounds.width)}" height="${num(bounds.height)}" viewBox="${box}">`,
  ]
  // A transparent file is the graph and nothing else: the ground belongs to wherever it gets pasted (G-45).
  if (!prefs.exportTransparentBackground) {
    parts.push(`<rect x="${num(bounds.minX)}" y="${num(bounds.minY)}" width="${num(bounds.width)}" height="${num(bounds.height)}" fill="${attr(colors.bgBase)}"/>`)
  }
  for (const edge of state.edges) parts.push(svgEdge(edge, colors, prefs.arrows))
  for (const node of state.nodes) parts.push(svgNode(node, colors, prefs.groupBy))
  if (titles) {
    for (const node of state.nodes) {
      if (graphLabelVisible(node, EXPORT_DRAW_SCALE)) parts.push(svgLabel(node, colors, fontFamily))
    }
  }
  parts.push('</svg>')
  return `${parts.join('\n')}\n`
}

export async function graphExportPng(
  state: CanvasState,
  colors: ThemeColors,
  prefs: GraphPreferences,
  fontFamily: string,
): Promise<Blob> {
  const titles = exportTitles(prefs)
  const bounds = graphExportBounds(state.nodes, titles)
  const geometry = graphExportGeometry(bounds)
  const canvas = document.createElement('canvas')
  canvas.width = geometry.width
  canvas.height = geometry.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('a 2d canvas is unavailable')
  ctx.setTransform(geometry.scale, 0, 0, geometry.scale, -bounds.minX * geometry.scale, -bounds.minY * geometry.scale)
  if (!prefs.exportTransparentBackground) {
    ctx.fillStyle = colors.bgBase
    ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height)
  }
  // An exported picture is the graph, not the search the reader was running on it (G-14).
  const scene: CanvasState = { ...state, searchHits: null, scale: EXPORT_DRAW_SCALE, width: bounds.width, height: bounds.height }
  const unselected: { current: null } = { current: null }
  drawEdges({ ctx, state: scene, colors, emphasizedId: null, arrows: prefs.arrows })
  ctx.globalAlpha = 1
  drawNodes({ ctx, state: scene, colors, emphasizedId: null, neighborIds: new Set(), groupBy: prefs.groupBy, selectedIdRef: unselected, activeNoteIdRef: unselected })
  ctx.globalAlpha = 1
  drawLabels({ ctx, state: scene, colors, emphasizedId: null, neighborIds: new Set(), fontFamily, scale: EXPORT_DRAW_SCALE, labels: titles })
  ctx.globalAlpha = 1
  return await canvasToPng(canvas)
}

/** Draws the whole graph into a file, named by the scope it was built for. */
export async function runGraphExport(state: CanvasState, prefs: GraphPreferences, kind: GraphExportKind): Promise<void> {
  const colors = readThemeColors()
  const fontFamily = readGraphExportFont()
  const blob = kind === 'svg'
    ? new Blob([graphExportSvg(state, colors, prefs, fontFamily)], { type: SVG_MIME })
    : await graphExportPng(state, colors, prefs, fontFamily)
  saveImage(blob, graphExportFilename(prefs.mode, kind))
}

function svgEdge(edge: { a: CanvasNode; b: CanvasNode }, colors: ThemeColors, arrows: boolean): string {
  const stroke = attr(colors.edge)
  const line = `<line x1="${num(edge.a.x)}" y1="${num(edge.a.y)}" x2="${num(edge.b.x)}" y2="${num(edge.b.y)}" stroke="${stroke}" stroke-width="1" opacity="${GRAPH_EDGE_ALPHA}"/>`
  return arrows ? `${line}\n${svgArrowHead(edge.a, edge.b, stroke)}` : line
}

function svgArrowHead(from: CanvasNode, to: CanvasNode, color: string): string {
  const corners = arrowHeadPoints(from, to, EXPORT_DRAW_SCALE)
    .map(([x, y]) => `${num(x)} ${num(y)}`)
    .join(' ')
  return `<polygon points="${corners}" fill="${color}"/>`
}

function svgNode(node: CanvasNode, colors: ThemeColors, groupBy: GraphPreferences['groupBy']): string {
  const fill = attr(nodeColor(node, { groupBy, fallback: colors.node, tagPalette: colors.tagPalette }))
  const circle = `<circle cx="${num(node.x)}" cy="${num(node.y)}" r="${num(node.r)}"`
  if (node.kind === 'unresolved') return `${circle} fill="none" stroke="${fill}" stroke-width="1.5"/>`
  const parts = [`${circle} fill="${fill}"/>`]
  if (node.kind === 'tag') {
    const tagRing = `<circle cx="${num(node.x)}" cy="${num(node.y)}" r="${num(node.r + GRAPH_TAG_RING_GAP)}" fill="none" stroke="${fill}" stroke-width="${GRAPH_TAG_RING_WIDTH}"/>`
    parts.push(tagRing)
  }
  if (node.pinned) {
    const pinRing = `<circle cx="${num(node.x)}" cy="${num(node.y)}" r="${num(node.r + 2.5)}" fill="none" stroke="${attr(colors.accent)}" stroke-width="1.5" opacity="${GRAPH_PIN_ALPHA}"/>`
    parts.push(pinRing)
  }
  return parts.join('\n')
}

function svgLabel(node: CanvasNode, colors: ThemeColors, fontFamily: string): string {
  const y = num(node.y + node.r + GRAPH_LABEL_OFFSET)
  return `<text x="${num(node.x)}" y="${y}" font-family="${attr(fontFamily)}" font-size="${GRAPH_LABEL_FONT_SIZE}" text-anchor="middle" fill="${attr(colors.text)}" stroke="${attr(colors.bgBase)}" stroke-width="${GRAPH_LABEL_HALO}" paint-order="stroke" opacity="${GRAPH_LABEL_ALPHA}">${escapeHtml(graphNodeLabel(node))}</text>`
}

/** What the file draws of what the panel shows: the reader can hand over the graph without its names (G-05). */
function exportTitles(prefs: GraphPreferences): boolean {
  return prefs.labels && !prefs.exportWithoutTitles
}

/** Two decimals place a node exactly and keep the file readable. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** A colour or a font name arrives from CSS, so it goes into an attribute only after escaping. */
function attr(value: string): string {
  return escapeHtml(value.trim())
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('the picture could not be encoded as a PNG'))
    }, 'image/png')
  })
}
