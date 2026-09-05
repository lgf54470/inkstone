import type { MutableRefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { truncateText } from '@shared/text-utils'
import { FALLBACK_ACCENT_COLOR, FALLBACK_EDGE_COLOR, FALLBACK_NODE_COLOR, FALLBACK_TEXT_COLOR, PHYSICS_FRAME_LIMIT } from './constants'
import { nodeColor } from './helpers'
import type { CanvasNode, CanvasState } from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'

export interface ThemeColors {
  edge: string
  node: string
  accent: string
  text: string
}

export function applyRepulsion(state: CanvasState, repulsion: number): void {
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
      if (distanceSquared > 120000) continue
      const distance = Math.sqrt(distanceSquared)
      const force = repulsion / distanceSquared
      const fx = dx / distance * force, fy = dy / distance * force
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
    }
    a.vx -= a.x * 0.0022
    a.vy -= a.y * 0.0022
  }
}

export function applySprings(state: CanvasState, linkDistance: number): void {
  for (const edge of state.edges) {
    const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y
    const distance = Math.hypot(dx, dy) || 1
    const force = (distance - linkDistance) * 0.008
    const fx = dx / distance * force, fy = dy / distance * force
    edge.a.vx += fx; edge.a.vy += fy; edge.b.vx -= fx; edge.b.vy -= fy
  }
}

export function applyVelocities(state: CanvasState): number {
  let movement = 0
  for (const node of state.nodes) {
    if (state.dragging?.node === node) continue
    node.vx *= 0.86; node.vy *= 0.86
    const moveX = Math.max(-8, Math.min(8, node.vx))
    const moveY = Math.max(-8, Math.min(8, node.vy))
    node.x += moveX; node.y += moveY
    movement += Math.abs(moveX) + Math.abs(moveY)
  }
  return movement
}

export function advancePhysics(state: CanvasState, prefs: GraphPreferences): void {
  if (state.frame >= PHYSICS_FRAME_LIMIT)
    return
  state.frame++
  applyRepulsion(state, prefs.repulsion)
  applySprings(state, prefs.linkDistance)
  const movement = applyVelocities(state)
  if (state.frame > 90 && movement < state.nodes.length * 0.01)
    state.frame = PHYSICS_FRAME_LIMIT
}

export function drawArrowHead(ctx: CanvasRenderingContext2D, a: CanvasNode, b: CanvasNode, color: string, scale: number): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const x = b.x - Math.cos(angle) * (b.r + 2)
  const y = b.y - Math.sin(angle) * (b.r + 2)
  const size = 5 / Math.sqrt(scale)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - Math.cos(angle - Math.PI / 6) * size, y - Math.sin(angle - Math.PI / 6) * size)
  ctx.lineTo(x - Math.cos(angle + Math.PI / 6) * size, y - Math.sin(angle + Math.PI / 6) * size)
  ctx.closePath(); ctx.fillStyle = color; ctx.fill()
}

export function drawEdges(ctx: CanvasRenderingContext2D, state: CanvasState, colors: ThemeColors, emphasizedId: string | null, arrows: boolean): void {
  ctx.lineWidth = 1 / state.scale
  for (const edge of state.edges) {
    const related = emphasizedId === edge.a.id || emphasizedId === edge.b.id
    ctx.strokeStyle = related ? colors.accent : colors.edge
    ctx.globalAlpha = related ? 0.9 : emphasizedId ? 0.14 : 0.42
    ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke()
    if (arrows)
      drawArrowHead(ctx, edge.a, edge.b, related ? colors.accent : colors.edge, state.scale)
  }
}

export function drawNodes(ctx: CanvasRenderingContext2D, state: CanvasState, colors: ThemeColors, emphasizedId: string | null, groupBy: GraphPreferences['groupBy'], selectedIdRef: MutableRefObject<string | null>, activeNoteIdRef: MutableRefObject<string | null>): void {
  for (const node of state.nodes) {
    const active = node.id === activeNoteIdRef.current
    const emphasized = node.id === emphasizedId
    ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.fillStyle = active || emphasized ? colors.accent : nodeColor(node, groupBy, colors.node)
    ctx.globalAlpha = emphasizedId && !emphasized && !active ? 0.34 : 1
    if (node.kind === 'unresolved') {
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 1.5 / state.scale
      ctx.stroke()
    } else {
      ctx.fill()
    }
    if (active || selectedIdRef.current === node.id) {
      ctx.strokeStyle = colors.accent; ctx.globalAlpha = 0.42; ctx.lineWidth = 3 / state.scale
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2); ctx.stroke()
    }
  }
}

export function drawLabels(ctx: CanvasRenderingContext2D, state: CanvasState, colors: ThemeColors, emphasizedId: string | null, fontFamily: string, scale: number, labels: boolean): void {
  if (!labels || !(scale > 0.68 || emphasizedId))
    return
  ctx.font = `${11 / scale}px ${fontFamily}`
  ctx.textAlign = 'center'
  for (const node of state.nodes) {
    const emphasized = node.id === emphasizedId
    if (!emphasized && node.degree < 1 && scale < 1.1) continue
    ctx.fillStyle = emphasized ? colors.accent : colors.text
    ctx.globalAlpha = emphasized ? 1 : emphasizedId ? 0.26 : 0.72
    const label = node.title.length > 18 ? `${truncateText(node.title, 18)}…` : node.title
    ctx.fillText(label, node.x, node.y + node.r + 12 / scale)
  }
}

export function createGraphTicker(state: CanvasState, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, colors: ThemeColors, prefs: GraphPreferences, hoverRef: MutableRefObject<CanvasNode | null>, selectedIdRef: MutableRefObject<string | null>, activeNoteIdRef: MutableRefObject<string | null>, style: CSSStyleDeclaration): void {
  const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(tick) }
  const tick = () => {
    state.raf = 0
    const rect = canvas.getBoundingClientRect()
    advancePhysics(state, prefs)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.save()
    ctx.translate(state.offsetX, state.offsetY)
    ctx.scale(state.scale, state.scale)
    const emphasizedId = hoverRef.current?.id ?? selectedIdRef.current
    drawEdges(ctx, state, colors, emphasizedId, prefs.arrows)
    ctx.globalAlpha = 1
    drawNodes(ctx, state, colors, emphasizedId, prefs.groupBy, selectedIdRef, activeNoteIdRef)
    ctx.globalAlpha = 1
    drawLabels(ctx, state, colors, emphasizedId, style.getPropertyValue('--font-ui'), state.scale, prefs.labels)
    ctx.globalAlpha = 1
    ctx.restore()
    if (state.frame < PHYSICS_FRAME_LIMIT) schedule()
  }
  state.schedule = schedule
}

export function buildInitialLayout(data: GraphResponse, prefs: GraphPreferences, state: CanvasState): void {
  state.nodes = data.nodes.map((node, index) => {
    const angle = index * 2.399963
    const radius = 18 * Math.sqrt(index)
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: (4 + Math.min(9, Math.sqrt(node.degree) * 2.4)) * prefs.nodeScale,
    }
  })
  const byId = new Map(state.nodes.map((node) => [node.id, node]))
  state.edges = data.edges.flatMap((edge) => {
    const a = byId.get(edge.source), b = byId.get(edge.target)
    return a && b ? [{ a, b }] : []
  })
  state.frame = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? PHYSICS_FRAME_LIMIT
    : 0
}

export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  return {
    edge: style.getPropertyValue('--border-strong').trim() || FALLBACK_EDGE_COLOR,
    node: style.getPropertyValue('--text-tertiary').trim() || FALLBACK_NODE_COLOR,
    accent: style.getPropertyValue('--accent').trim() || FALLBACK_ACCENT_COLOR,
    text: style.getPropertyValue('--text-secondary').trim() || FALLBACK_TEXT_COLOR,
  }
}

export function createCanvasResizer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: CanvasState): { resize: () => void; observer: ResizeObserver } {
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!state.offsetX && !state.offsetY) {
      state.offsetX = rect.width / 2
      state.offsetY = rect.height / 2
    }
    state.schedule?.()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  return { resize, observer }
}