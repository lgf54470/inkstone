import type { MutableRefObject } from 'react'
import { ORGANIZER_COLORS } from '@shared/organizer-colors'
import type { GraphResponse } from '@shared/types'
import { FALLBACK_ACCENT_COLOR, FALLBACK_BG_COLOR, FALLBACK_EDGE_COLOR, FALLBACK_NODE_COLOR, FALLBACK_TEXT_COLOR, GRAPH_ARROW_SIZE, GRAPH_EDGE_ALPHA, GRAPH_LABEL_ALPHA, GRAPH_LABEL_FONT_SIZE, GRAPH_LABEL_HALO, GRAPH_LABEL_OFFSET, GRAPH_PIN_ALPHA, GRAPH_SEARCH_DIM_ALPHA, GRAPH_SEARCH_DIM_EDGE_ALPHA, GRAPH_SETTLE_FRAME, GRAPH_TAG_PALETTE_SIZE, GRAPH_TAG_RING_GAP, GRAPH_TAG_RING_WIDTH, PHYSICS_FRAME_LIMIT } from './constants'
import { colorGroupsByNodeId, graphLabelVisible, graphNodeLabel, graphTagTokenName, nodeColor, tagColorsByName } from './helpers'
import type {
  CanvasNode,
  CanvasState,
  DrawArrowHeadOptions,
  DrawEdgesOptions,
  DrawLabelsOptions,
  DrawNodesOptions,
  GraphTickerOptions,
  ThemeColors,
} from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'

export type {
  DrawArrowHeadOptions,
  DrawEdgesOptions,
  DrawLabelsOptions,
  DrawNodesOptions,
  GraphTickerOptions,
  ThemeColors,
}


function applyRepulsion(state: CanvasState, repulsion: number): void {
  for (let i = 0; i < state.nodes.length; i++) {
    const a = state.nodes[i]!
    for (let j = i + 1; j < state.nodes.length; j++) {
      const b = state.nodes[j]!
      let dx = b.x - a.x, dy = b.y - a.y
      let distanceSquared = dx * dx + dy * dy
      if (distanceSquared < 0.01) {
        dx = (Math.random() - 0.5) * 0.6
        dy = (Math.random() - 0.5) * 0.6
        distanceSquared = 0.36
      }
      const distance = Math.sqrt(distanceSquared)
      const force = (repulsion / (distanceSquared + 400)) * Math.max(0.04, 1 - distance / 2400)
      const fx = (dx / distance) * force, fy = (dy / distance) * force
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
    }
    a.vx -= a.x * 0.0012
    a.vy -= a.y * 0.0012
  }
}


function applySprings(state: CanvasState, linkDistance: number): void {
  for (const edge of state.edges) {
    const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y
    const distance = Math.hypot(dx, dy) || 1
    const force = (distance - linkDistance) * 0.008
    const fx = dx / distance * force, fy = dy / distance * force
    edge.a.vx += fx; edge.a.vy += fy; edge.b.vx -= fx; edge.b.vy -= fy
  }
}


function applyVelocities(state: CanvasState): number {
  let movement = 0
  for (const node of state.nodes) {
    if (state.dragging?.node === node || node.pinned) continue
    node.vx *= 0.86; node.vy *= 0.86
    const moveX = Math.max(-8, Math.min(8, node.vx))
    const moveY = Math.max(-8, Math.min(8, node.vy))
    node.x += moveX; node.y += moveY
    movement += Math.abs(moveX) + Math.abs(moveY)
  }
  return movement
}


function advancePhysics(state: CanvasState, prefs: GraphPreferences): void {
  if (state.frame >= PHYSICS_FRAME_LIMIT)
    return
  state.frame++
  applyRepulsion(state, prefs.repulsion)
  applySprings(state, prefs.linkDistance)
  const movement = applyVelocities(state)
  if (state.frame > 90 && movement < state.nodes.length * 0.01)
    state.frame = PHYSICS_FRAME_LIMIT
}


/** The three corners of an arrow head: the tip sits just outside the node it points at. */
export function arrowHeadPoints(from: CanvasNode, to: CanvasNode, scale: number): Array<[number, number]> {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = GRAPH_ARROW_SIZE / Math.sqrt(scale)
  const x = to.x - Math.cos(angle) * (to.r + 2)
  const y = to.y - Math.sin(angle) * (to.r + 2)
  return [
    [x, y],
    [x - Math.cos(angle - Math.PI / 6) * size, y - Math.sin(angle - Math.PI / 6) * size],
    [x - Math.cos(angle + Math.PI / 6) * size, y - Math.sin(angle + Math.PI / 6) * size],
  ]
}

function drawArrowHead({ ctx, from, to, color, scale }: DrawArrowHeadOptions): void {
  const [tip, left, right] = arrowHeadPoints(from, to, scale)
  ctx.beginPath()
  ctx.moveTo(tip![0], tip![1])
  ctx.lineTo(left![0], left![1])
  ctx.lineTo(right![0], right![1])
  ctx.closePath(); ctx.fillStyle = color; ctx.fill()
}

export function drawEdges({ ctx, state, colors, emphasizedId, arrows }: DrawEdgesOptions): void {
  ctx.lineWidth = 1 / state.scale
  for (const edge of state.edges) {
    const related = emphasizedId === edge.a.id || emphasizedId === edge.b.id
    const missed = isSearchMissed(state, edge.a.id) && isSearchMissed(state, edge.b.id)
    ctx.strokeStyle = related ? colors.accent : colors.edge
    ctx.globalAlpha = related ? 0.9 : emphasizedId ? 0.14 : missed ? GRAPH_SEARCH_DIM_EDGE_ALPHA : GRAPH_EDGE_ALPHA
    ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke()
    if (arrows)
      drawArrowHead({ ctx, from: edge.a, to: edge.b, color: related ? colors.accent : colors.edge, scale: state.scale })
  }
}

export function getConnectedNeighborIds(state: CanvasState, targetId: string | null): Set<string> {
  const neighbors = new Set<string>()
  if (!targetId) return neighbors
  for (const edge of state.edges) {
    if (edge.a.id === targetId) neighbors.add(edge.b.id)
    else if (edge.b.id === targetId) neighbors.add(edge.a.id)
  }
  return neighbors
}

/** A node the search did not hit. Only a canvas with a search on it fades anything at all. */
function isSearchMissed(state: CanvasState, id: string): boolean {
  return state.searchHits !== null && !state.searchHits.has(id)
}

export function drawNodes({
  ctx,
  state,
  colors,
  emphasizedId,
  neighborIds,
  groupBy,
  selectedIdRef,
  activeNoteIdRef,
}: DrawNodesOptions): void {
  for (const node of state.nodes) {
    const active = node.id === activeNoteIdRef.current
    const emphasized = node.id === emphasizedId
    const isNeighbor = neighborIds.has(node.id)
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fillStyle = active || emphasized ? colors.accent : nodeColor(node, { groupBy, fallback: colors.node, tagPalette: colors.tagPalette })
    // The node being hovered, its neighbours and the note being read are never faded: a search narrows
    // what a reader is looking at, it does not remove what they are holding on to (G-14).
    if (!emphasized && !active && !isNeighbor) {
      ctx.globalAlpha = isSearchMissed(state, node.id) ? GRAPH_SEARCH_DIM_ALPHA : emphasizedId ? 0.18 : 1
    } else {
      ctx.globalAlpha = 1
    }
    if (node.kind === 'unresolved') {
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 1.5 / state.scale
      ctx.stroke()
    } else {
      ctx.fill()
    }
    if (node.kind === 'tag') {
      // Colour says which group a node belongs to, so the ring says what the node is instead: a double
      // ring reads apart from a plain note and a hollow ghost whatever palette the tagging is using.
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = GRAPH_TAG_RING_WIDTH / state.scale
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r + GRAPH_TAG_RING_GAP, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (active || selectedIdRef.current === node.id) {
      ctx.strokeStyle = colors.accent; ctx.globalAlpha = 0.42; ctx.lineWidth = 3 / state.scale
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2); ctx.stroke()
    }
    if (node.pinned) {
      ctx.strokeStyle = colors.accent; ctx.globalAlpha = GRAPH_PIN_ALPHA; ctx.lineWidth = 1.5 / state.scale
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r + 2.5, 0, Math.PI * 2); ctx.stroke()
    }
  }
}

export function drawLabels({
  ctx,
  state,
  colors,
  emphasizedId,
  neighborIds,
  fontFamily,
  scale,
  labels,
}: DrawLabelsOptions): void {
  if (!labels || !(scale > 0.68 || emphasizedId))
    return
  ctx.font = `${GRAPH_LABEL_FONT_SIZE / scale}px ${fontFamily}`
  ctx.textAlign = 'center'
  for (const node of state.nodes) {
    const emphasized = node.id === emphasizedId
    const isNeighbor = neighborIds.has(node.id)
    if (!emphasized && !isNeighbor && !graphLabelVisible(node, scale)) continue
    ctx.fillStyle = emphasized ? colors.accent : colors.text
    ctx.globalAlpha = emphasized || isNeighbor ? 1 : isSearchMissed(state, node.id) ? GRAPH_SEARCH_DIM_ALPHA : emphasizedId ? 0.18 : GRAPH_LABEL_ALPHA
    const label = graphNodeLabel(node)
    ctx.lineWidth = GRAPH_LABEL_HALO / scale
    ctx.strokeStyle = colors.bgBase
    ctx.strokeText(label, node.x, node.y + node.r + GRAPH_LABEL_OFFSET / scale)
    ctx.fillText(label, node.x, node.y + node.r + GRAPH_LABEL_OFFSET / scale)
  }
}

function renderGraphScene(options: GraphTickerOptions): void {
  const { state, canvas, ctx, colorsRef, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style } = options
  const prefs = 'current' in prefsRef ? prefsRef.current : prefsRef
  const colors = 'current' in colorsRef ? colorsRef.current : colorsRef
  advancePhysics(state, prefs)
  const width = state.width || canvas.width || 800
  const height = state.height || canvas.height || 600
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(state.offsetX, state.offsetY)
  ctx.scale(state.scale, state.scale)
  const emphasizedId = hoverRef.current?.id ?? selectedIdRef.current
  const neighborIds = getConnectedNeighborIds(state, emphasizedId)
  drawEdges({ ctx, state, colors, emphasizedId, arrows: prefs.arrows })
  ctx.globalAlpha = 1
  drawNodes({ ctx, state, colors, emphasizedId, neighborIds, groupBy: prefs.groupBy, selectedIdRef, activeNoteIdRef })
  ctx.globalAlpha = 1
  drawLabels({ ctx, state, colors, emphasizedId, neighborIds, fontFamily: style.getPropertyValue('--font-ui'), scale: state.scale, labels: prefs.labels })
  ctx.globalAlpha = 1
  ctx.restore()
}

export function createGraphTicker(
  optionsOrState: GraphTickerOptions | CanvasState,
  canvas?: HTMLCanvasElement,
  ctx?: CanvasRenderingContext2D,
  colorsRef?: ThemeColors | { current: ThemeColors },
  prefsRef?: GraphPreferences | { current: GraphPreferences },
  hoverRef?: MutableRefObject<CanvasNode | null>,
  selectedIdRef?: MutableRefObject<string | null>,
  activeNoteIdRef?: MutableRefObject<string | null>,
  style?: CSSStyleDeclaration,
): void {
  const options: GraphTickerOptions = 'canvas' in optionsOrState
    ? optionsOrState
    : {
        state: optionsOrState,
        canvas: canvas!,
        ctx: ctx!,
        colorsRef: colorsRef!,
        prefsRef: prefsRef!,
        hoverRef: hoverRef!,
        selectedIdRef: selectedIdRef!,
        activeNoteIdRef: activeNoteIdRef!,
        style: style!,
      }

  let previousFrame = 0
  const schedule = () => { if (!options.state.raf) options.state.raf = requestAnimationFrame(tick) }
  const tick = () => {
    options.state.raf = 0
    renderGraphScene(options)
    const frame = options.state.frame
    if (frame >= GRAPH_SETTLE_FRAME && previousFrame < GRAPH_SETTLE_FRAME) options.onSettled?.()
    previousFrame = frame
    if (frame < PHYSICS_FRAME_LIMIT) schedule()
  }
  options.state.schedule = schedule
}


export function buildInitialLayout(data: GraphResponse, prefs: GraphPreferences, state: CanvasState, previous?: readonly CanvasNode[]): void {
  const inherited = new Map<string, CanvasNode>()
  for (const node of previous ?? []) inherited.set(node.id, node)
  const tagColors = tagColorsByName(data.nodes)
  const ruleColors = colorGroupsByNodeId(data.nodes, prefs.colorGroups)
  state.nodes = data.nodes.map((node, index) => {
    const before = inherited.get(node.id)
    const angle = index * 2.399963
    const radius = 18 * Math.sqrt(index)
    const laidOut: CanvasNode = {
      ...node,
      x: before?.x ?? Math.cos(angle) * radius,
      y: before?.y ?? Math.sin(angle) * radius,
      vx: before?.vx ?? 0,
      vy: before?.vy ?? 0,
      r: (4 + Math.min(9, Math.sqrt(node.degree) * 2.4)) * prefs.nodeScale,
      tagColor: node.kind === 'tag' ? tagColors.get(node.title.toLowerCase()) ?? null : null,
      colorGroup: ruleColors.get(node.id)?.color ?? null,
    }
    if (before?.pinned || prefs.pinnedNodeIds.includes(node.id)) laidOut.pinned = true
    return laidOut
  })
  const byId = new Map(state.nodes.map((node) => [node.id, node]))
  state.edges = data.edges.flatMap((edge) => {
    const a = byId.get(edge.source), b = byId.get(edge.target)
    return a && b ? [{ a, b }] : []
  })
  const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    for (let step = 0; step < 120 && state.frame < PHYSICS_FRAME_LIMIT; step++) {
      advancePhysics(state, prefs)
    }
    state.frame = PHYSICS_FRAME_LIMIT
  } else {
    state.frame = 0
  }
}

export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  return {
    edge: style.getPropertyValue('--border-strong').trim() || FALLBACK_EDGE_COLOR,
    node: style.getPropertyValue('--text-tertiary').trim() || FALLBACK_NODE_COLOR,
    accent: style.getPropertyValue('--accent').trim() || FALLBACK_ACCENT_COLOR,
    text: style.getPropertyValue('--text-secondary').trim() || FALLBACK_TEXT_COLOR,
    bgBase: style.getPropertyValue('--bg-base').trim() || FALLBACK_BG_COLOR,
    // A tag with no colour of its own reads one of these. With no stylesheet in reach (tests, the
    // first paint) the shared organizer palette stands in, so there is no third palette to drift.
    tagPalette: Array.from({ length: GRAPH_TAG_PALETTE_SIZE }, (_, index) =>
      style.getPropertyValue(graphTagTokenName(index)).trim() || ORGANIZER_COLORS[index]!),
  }
}

export function createThemeObserver(colorsRef: { current: ThemeColors }, onUpdate: () => void): MutationObserver {
  const observer = new MutationObserver(() => {
    colorsRef.current = readThemeColors()
    onUpdate()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-accent'],
  })
  return observer
}

export function createCanvasResizer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: CanvasState): { resize: () => void; observer: ResizeObserver } {
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    state.width = rect.width
    state.height = rect.height
    // The pointer paths read these instead of the box itself: a drag would otherwise ask the layout
    // engine for the same numbers on every move, forcing a synchronous layout per event. A resize
    // is the only thing that moves this canvas without also moving the panel that holds it.
    state.viewLeft = rect.left
    state.viewTop = rect.top
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (state.nodes.length === 0) {
      state.offsetX = rect.width / 2
      state.offsetY = rect.height / 2
    }
    state.schedule?.()
  }
  // Measured once before observing: the observer's first callback is asynchronous, and a pointer that
  // arrives in between would read the cached box as a zero offset.
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  return { resize, observer }
}