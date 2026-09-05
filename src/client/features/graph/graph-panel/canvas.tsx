import { useCallback, useEffect, useState, type MutableRefObject, type RefObject } from 'react'
import { CircleDot, FolderOpen, PanelRightClose } from 'lucide-react'
import type { GraphResponse } from '@shared/types'
import { truncateText } from '@shared/text-utils'
import { Menu, type MenuItem } from '../../../components/overlay'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { t } from '../../../lib/i18n'
import { getLinkHoverTarget, subscribeLinkHoverTarget } from '../../preview'
import { FALLBACK_ACCENT_COLOR, FALLBACK_EDGE_COLOR, FALLBACK_NODE_COLOR, FALLBACK_TEXT_COLOR, PHYSICS_FRAME_LIMIT } from './constants'
import { graphScaleAfterWheel, nodeColor } from './helpers'
import type { CanvasNode, CanvasState } from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'

export interface GraphControls {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

interface GraphCanvasProps {
  data: GraphResponse
  prefs: GraphPreferences
  activeNoteId: string | null
  canvasRef: RefObject<HTMLCanvasElement | null>
  stateRef: RefObject<CanvasState>
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  activeNoteIdRef: MutableRefObject<string | null>
  lastPointerEventAtRef: MutableRefObject<number>
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onClose: () => void
  onMakeLocal: () => void
  controlsRef: MutableRefObject<GraphControls | null>
}

export function GraphCanvas({ data, prefs, activeNoteId, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, lastPointerEventAtRef, onOpenNote, onCreateNote, onClose, onMakeLocal, controlsRef }: GraphCanvasProps) {
  const [hover, setHover] = useState<CanvasNode | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [context, setContext] = useState<{ x: number; y: number; node: CanvasNode } | null>(null)
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
    stateRef.current.schedule?.()
  }, [activeNoteId])
  useEffect(() => {
    selectedIdRef.current = selectedId
    stateRef.current.schedule?.()
  }, [selectedId])

  useEffect(() => subscribeLinkHoverTarget((noteId) => {
    const state = stateRef.current
    const node = noteId ? state.nodes.find((candidate) => candidate.id === noteId) ?? null : null
    hoverRef.current = node
    setHover(node)
    state.schedule?.()
  }), [])

  const fitGraph = useCallback(() => {
    const canvas = canvasRef.current
    const state = stateRef.current
    if (!canvas || !state.nodes.length) return
    const rect = canvas.getBoundingClientRect()
    const xs = state.nodes.map((node) => node.x)
    const ys = state.nodes.map((node) => node.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const width = Math.max(80, maxX - minX + 80)
    const height = Math.max(80, maxY - minY + 80)
    state.scale = Math.min(2.5, Math.max(0.2, Math.min(rect.width / width, rect.height / height)))
    state.offsetX = rect.width / 2 - ((minX + maxX) / 2) * state.scale
    state.offsetY = rect.height / 2 - ((minY + maxY) / 2) * state.scale
    state.schedule?.()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = stateRef.current
    hoverRef.current = null
    setHover(null)
    setSelectedId((current) => data.nodes.some((node) => node.id === current) ? current : null)
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
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const style = getComputedStyle(document.documentElement)
    const colors = {
      edge: style.getPropertyValue('--border-strong').trim() || FALLBACK_EDGE_COLOR,
      node: style.getPropertyValue('--text-tertiary').trim() || FALLBACK_NODE_COLOR,
      accent: style.getPropertyValue('--accent').trim() || FALLBACK_ACCENT_COLOR,
      text: style.getPropertyValue('--text-secondary').trim() || FALLBACK_TEXT_COLOR,
    }
    const schedule = () => { if (!state.raf) state.raf = requestAnimationFrame(tick) }
    const tick = () => {
      state.raf = 0
      const rect = canvas.getBoundingClientRect()
      if (state.frame < PHYSICS_FRAME_LIMIT) {
        state.frame++
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
            const force = prefs.repulsion / distanceSquared
            const fx = dx / distance * force, fy = dy / distance * force
            a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
          }
          a.vx -= a.x * 0.0022
          a.vy -= a.y * 0.0022
        }
        for (const edge of state.edges) {
          const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y
          const distance = Math.hypot(dx, dy) || 1
          const force = (distance - prefs.linkDistance) * 0.008
          const fx = dx / distance * force, fy = dy / distance * force
          edge.a.vx += fx; edge.a.vy += fy; edge.b.vx -= fx; edge.b.vy -= fy
        }
        let movement = 0
        for (const node of state.nodes) {
          if (state.dragging?.node === node) continue
          node.vx *= 0.86; node.vy *= 0.86
          const moveX = Math.max(-8, Math.min(8, node.vx))
          const moveY = Math.max(-8, Math.min(8, node.vy))
          node.x += moveX; node.y += moveY
          movement += Math.abs(moveX) + Math.abs(moveY)
        }
        if (state.frame > 90 && movement < state.nodes.length * 0.01) state.frame = PHYSICS_FRAME_LIMIT
      }
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.save()
      ctx.translate(state.offsetX, state.offsetY)
      ctx.scale(state.scale, state.scale)
      const emphasizedId = hoverRef.current?.id ?? selectedIdRef.current
      ctx.lineWidth = 1 / state.scale
      for (const edge of state.edges) {
        const related = emphasizedId === edge.a.id || emphasizedId === edge.b.id
        ctx.strokeStyle = related ? colors.accent : colors.edge
        ctx.globalAlpha = related ? 0.9 : emphasizedId ? 0.14 : 0.42
        ctx.beginPath(); ctx.moveTo(edge.a.x, edge.a.y); ctx.lineTo(edge.b.x, edge.b.y); ctx.stroke()
        if (prefs.arrows) {
          const angle = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x)
          const x = edge.b.x - Math.cos(angle) * (edge.b.r + 2)
          const y = edge.b.y - Math.sin(angle) * (edge.b.r + 2)
          const size = 5 / Math.sqrt(state.scale)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - Math.cos(angle - Math.PI / 6) * size, y - Math.sin(angle - Math.PI / 6) * size)
          ctx.lineTo(x - Math.cos(angle + Math.PI / 6) * size, y - Math.sin(angle + Math.PI / 6) * size)
          ctx.closePath(); ctx.fillStyle = related ? colors.accent : colors.edge; ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      for (const node of state.nodes) {
        const active = node.id === activeNoteIdRef.current
        const emphasized = node.id === emphasizedId
        ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
        ctx.fillStyle = active || emphasized ? colors.accent : nodeColor(node, prefs.groupBy, colors.node)
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
      ctx.globalAlpha = 1
      if (prefs.labels && (state.scale > 0.68 || emphasizedId)) {
        ctx.font = `${11 / state.scale}px ${style.getPropertyValue('--font-ui')}`
        ctx.textAlign = 'center'
        for (const node of state.nodes) {
          const emphasized = node.id === emphasizedId
          if (!emphasized && node.degree < 1 && state.scale < 1.1) continue
          ctx.fillStyle = emphasized ? colors.accent : colors.text
          ctx.globalAlpha = emphasized ? 1 : emphasizedId ? 0.26 : 0.72
          const label = node.title.length > 18 ? `${truncateText(node.title, 18)}…` : node.title
          ctx.fillText(label, node.x, node.y + node.r + 12 / state.scale)
        }
      }
      ctx.globalAlpha = 1
      ctx.restore()
      if (state.frame < PHYSICS_FRAME_LIMIT) schedule()
    }
    state.schedule = schedule
    const linkedTargetId = getLinkHoverTarget()
    const linkedNode = linkedTargetId ? state.nodes.find((candidate) => candidate.id === linkedTargetId) ?? null : null
    hoverRef.current = linkedNode
    setHover(linkedNode)
    schedule()
    const fitTimer = window.setTimeout(fitGraph, 120)
    return () => {
      window.clearTimeout(fitTimer)
      cancelAnimationFrame(state.raf)
      state.raf = 0; state.schedule = null
      observer.disconnect()
    }
  }, [data, fitGraph, prefs.arrows, prefs.groupBy, prefs.labels, prefs.linkDistance, prefs.nodeScale, prefs.repulsion])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - state.offsetX) / state.scale, y: (clientY - rect.top - state.offsetY) / state.scale }
  }, [])
  const nodeAt = useCallback((x: number, y: number): CanvasNode | null => {
    const nodes = stateRef.current.nodes
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]!
      if (Math.hypot(node.x - x, node.y - y) <= node.r + 7) return node
    }
    return null
  }, [])

  const beginDrag = useCallback((clientX: number, clientY: number, button: number) => {
    if (button !== 0) return
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    const node = nodeAt(point.x, point.y)
    state.dragging = { node, startX: clientX, startY: clientY, ox: state.offsetX, oy: state.offsetY }
    if (node) setSelectedId(node.id)
  }, [nodeAt, toWorld])
  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    if (state.dragging) {
      if (state.dragging.node) {
        state.dragging.node.x = point.x; state.dragging.node.y = point.y
        state.dragging.node.vx = 0; state.dragging.node.vy = 0
        state.frame = Math.min(state.frame, PHYSICS_FRAME_LIMIT - 100)
      } else {
        state.offsetX = state.dragging.ox + clientX - state.dragging.startX
        state.offsetY = state.dragging.oy + clientY - state.dragging.startY
      }
      state.schedule?.(); return
    }
    const node = nodeAt(point.x, point.y)
    if (hoverRef.current?.id !== node?.id) {
      hoverRef.current = node; setHover(node); state.schedule?.()
    }
  }, [nodeAt, toWorld])
  const endDrag = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const drag = state.dragging
    state.dragging = null
    if (!drag) return
    const moved = Math.abs(clientX - drag.startX) + Math.abs(clientY - drag.startY)
    if (drag.node && moved < 5) {
      if (drag.node.kind === 'note') {
        if (usePinnedWindows.getState().focusPinnedByNote(drag.node.id)) return
        void onOpenNote(drag.node.id)
      }
      else void onCreateNote(drag.node.title)
      onClose()
    }
  }, [onCreateNote, onClose, onOpenNote])

  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null
  const menuItems: MenuItem[] = context ? [
    { id: 'open', label: context.node.kind === 'unresolved' ? t('graph.create_note') : t('graph.open_note'), icon: <FolderOpen size={14}/>, onSelect: () => {
      if (context.node.kind === 'unresolved') void onCreateNote(context.node.title)
      else void onOpenNote(context.node.id)
      onClose()
    } },
    { id: 'right', label: t('graph.open_to_right'), icon: <PanelRightClose size={14}/>, disabled: context.node.kind === 'unresolved', onSelect: () => { void onOpenNote(context.node.id, { pane: 'secondary' }) } },
    { id: 'local', label: t('graph.make_local_center'), icon: <CircleDot size={14}/>, disabled: context.node.kind === 'unresolved', separatorBefore: true, onSelect: () => {
      void onOpenNote(context.node.id)
      onMakeLocal()
    } },
  ] : []

  const zoomIn = () => {
    const state = stateRef.current; state.scale = Math.min(4, state.scale + 0.2); state.schedule?.()
  }
  const zoomOut = () => {
    const state = stateRef.current; state.scale = Math.max(0.2, state.scale - 0.2); state.schedule?.()
  }
  controlsRef.current = { zoomIn, zoomOut, fit: fitGraph }

  return (
    <>
          <canvas ref={canvasRef} tabIndex={0} role="application" aria-label={t('graph.graph_canvas_accessible')}
            className="size-full touch-none cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] active:cursor-grabbing"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              lastPointerEventAtRef.current = performance.now()
              event.currentTarget.setPointerCapture(event.pointerId)
              const state = stateRef.current
              state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
              if (state.pointers.size === 1) beginDrag(event.clientX, event.clientY, event.button)
              else if (state.pointers.size === 2) {
                const [a, b] = [...state.pointers.values()]
                state.dragging = null
                state.pinch = { distance: Math.hypot(b!.x - a!.x, b!.y - a!.y), scale: state.scale, centerX: (a!.x + b!.x) / 2, centerY: (a!.y + b!.y) / 2 }
              }
            }}
            onPointerMove={(event) => {
              lastPointerEventAtRef.current = performance.now()
              const state = stateRef.current
              if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
              if (state.pointers.size >= 2 && state.pinch) {
                const [a, b] = [...state.pointers.values()]
                const distance = Math.hypot(b!.x - a!.x, b!.y - a!.y)
                state.scale = Math.min(4, Math.max(0.2, state.pinch.scale * distance / Math.max(1, state.pinch.distance)))
                state.schedule?.(); return
              }
              moveDrag(event.clientX, event.clientY)
            }}
            onPointerUp={(event) => {
              lastPointerEventAtRef.current = performance.now()
              const state = stateRef.current
              state.pointers.delete(event.pointerId)
              if (!state.pinch) endDrag(event.clientX, event.clientY)
              if (state.pointers.size < 2) state.pinch = null
            }}
            onPointerCancel={(event) => {
              const state = stateRef.current; state.pointers.delete(event.pointerId); state.dragging = null; state.pinch = null
            }}
            onMouseDown={(event) => { if (performance.now() - lastPointerEventAtRef.current > 80) beginDrag(event.clientX, event.clientY, event.button) }}
            onMouseMove={(event) => { if (performance.now() - lastPointerEventAtRef.current > 80) moveDrag(event.clientX, event.clientY) }}
            onMouseUp={(event) => { if (performance.now() - lastPointerEventAtRef.current > 80) endDrag(event.clientX, event.clientY) }}
            onMouseLeave={() => {
              const state = stateRef.current; state.dragging = null
              hoverRef.current = null; setHover(null); state.schedule?.()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              const point = toWorld(event.clientX, event.clientY)
              const node = nodeAt(point.x, point.y)
              if (node) { setSelectedId(node.id); setContext({ x: event.clientX, y: event.clientY, node }) }
            }}
            onWheel={(event) => {
              const state = stateRef.current
              const rect = event.currentTarget.getBoundingClientRect()
              const x = event.clientX - rect.left, y = event.clientY - rect.top
              const next = graphScaleAfterWheel(state.scale, event.deltaY)
              if (next === state.scale) return
              event.preventDefault()
              state.offsetX = x - (x - state.offsetX) / state.scale * next
              state.offsetY = y - (y - state.offsetY) / state.scale * next
              state.scale = next; state.schedule?.()
            }}
            onKeyDown={(event) => {
              const state = stateRef.current
              if (event.key === '+' || event.key === '=') state.scale = Math.min(4, state.scale + 0.2)
              else if (event.key === '-') state.scale = Math.max(0.2, state.scale - 0.2)
              else if (event.key === 'Home') fitGraph()
              else if (event.key === 'Enter' && selectedIdRef.current) {
                const selectedNode = state.nodes.find((node) => node.id === selectedIdRef.current)
                if (selectedNode?.kind === 'note') {
                  if (usePinnedWindows.getState().focusPinnedByNote(selectedNode.id)) return
                  void onOpenNote(selectedNode.id)
                }
                else if (selectedNode) void onCreateNote(selectedNode.title)
                if (selectedNode) onClose()
              }
              else if (event.key.startsWith('Arrow')) {
                const current = Math.max(0, state.nodes.findIndex((node) => node.id === selectedIdRef.current))
                const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
                const next = state.nodes[(current + step + state.nodes.length) % state.nodes.length]
                if (next) setSelectedId(next.id)
              } else return
              event.preventDefault(); state.schedule?.()
            }}/>
          {data.meta.truncated && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3 py-1 text-[length:var(--text-11)] text-[var(--text-secondary)] shadow-sm">
            {t('graph.showing_limit', { shown: data.nodes.length, total: data.meta.totalNodes })}
          </div>}
          {(hover || selected) && <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3.5 py-1.5 text-[length:var(--text-12)] shadow-[var(--shadow-pop)]">
            <span className="max-w-[50vw] truncate">{(hover ?? selected)!.title || t('common.untitled_note')}</span>
            <span className="ml-2 text-[var(--text-quaternary)]">{t('graph.direction_counts', { incoming: (hover ?? selected)!.inDegree, outgoing: (hover ?? selected)!.outDegree })}</span>
          </div>}
          <div className="pointer-events-none absolute top-3 left-4 hidden text-[length:var(--text-11)] text-[var(--text-quaternary)] md:block">{t('graph.interaction_hint')}</div>
        <Menu anchor={context ?? { x: 0, y: 0 }} open={Boolean(context)} onClose={() => setContext(null)} items={menuItems} label={t('graph.node_actions')}/>
    </>
  )
}
