import { useCallback, useEffect, useState, type MutableRefObject, type RefObject } from 'react'
import { CircleDot, FolderOpen, PanelRightClose } from 'lucide-react'
import type { GraphResponse } from '@shared/types'
import { Menu, type MenuItem } from '../../../components/overlay'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { t } from '../../../lib/i18n'
import { getLinkHoverTarget, subscribeLinkHoverTarget } from '../../preview'
import { graphScaleAfterWheel } from './helpers'
import { PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasNode, CanvasState } from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'
import { buildInitialLayout, createCanvasResizer, createGraphTicker, readThemeColors } from './canvas-draw'

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

function useGraphFit(canvasRef: RefObject<HTMLCanvasElement | null>, stateRef: RefObject<CanvasState>) {
  return useCallback(() => {
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
  }, [canvasRef, stateRef])
}

function useGraphCanvasLoop(data: GraphResponse, prefs: GraphPreferences, canvasRef: RefObject<HTMLCanvasElement | null>, stateRef: RefObject<CanvasState>, hoverRef: MutableRefObject<CanvasNode | null>, selectedIdRef: MutableRefObject<string | null>, activeNoteIdRef: MutableRefObject<string | null>, setHover: (node: CanvasNode | null) => void, setSelectedId: React.Dispatch<React.SetStateAction<string | null>>, fitGraph: () => void) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = stateRef.current
    hoverRef.current = null
    setHover(null)
    setSelectedId((current) => data.nodes.some((node) => node.id === current) ? current : null)
    buildInitialLayout(data, prefs, state)
    const colors = readThemeColors()
    const { resize, observer } = createCanvasResizer(canvas, ctx, state)
    resize()
    const style = getComputedStyle(document.documentElement)
    createGraphTicker(state, canvas, ctx, colors, prefs, hoverRef, selectedIdRef, activeNoteIdRef, style)
    const linkedTargetId = getLinkHoverTarget()
    const linkedNode = linkedTargetId ? state.nodes.find((candidate) => candidate.id === linkedTargetId) ?? null : null
    hoverRef.current = linkedNode
    setHover(linkedNode)
    state.schedule?.()
    const fitTimer = window.setTimeout(fitGraph, 120)
    return () => {
      window.clearTimeout(fitTimer)
      cancelAnimationFrame(state.raf)
      state.raf = 0; state.schedule = null
      observer.disconnect()
    }
  }, [data, fitGraph, prefs.arrows, prefs.groupBy, prefs.labels, prefs.linkDistance, prefs.nodeScale, prefs.repulsion])
}

function useGraphWorldMath(stateRef: RefObject<CanvasState>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - state.offsetX) / state.scale, y: (clientY - rect.top - state.offsetY) / state.scale }
  }, [canvasRef, stateRef])
  const nodeAt = useCallback((x: number, y: number): CanvasNode | null => {
    const nodes = stateRef.current.nodes
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]!
      if (Math.hypot(node.x - x, node.y - y) <= node.r + 7) return node
    }
    return null
  }, [stateRef])
  return { toWorld, nodeAt }
}

function useGraphDrag(stateRef: RefObject<CanvasState>, toWorld: (clientX: number, clientY: number) => { x: number; y: number }, nodeAt: (x: number, y: number) => CanvasNode | null, hoverRef: MutableRefObject<CanvasNode | null>, setHover: (node: CanvasNode | null) => void, setSelectedId: (id: string | null) => void, onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void, onCreateNote: (title: string) => void, onClose: () => void) {
  const beginDrag = useCallback((clientX: number, clientY: number, button: number) => {
    if (button !== 0) return
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    const node = nodeAt(point.x, point.y)
    state.dragging = { node, startX: clientX, startY: clientY, ox: state.offsetX, oy: state.offsetY }
    if (node) setSelectedId(node.id)
  }, [nodeAt, setSelectedId, stateRef, toWorld])
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
  }, [hoverRef, nodeAt, setHover, stateRef, toWorld])
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
  }, [onCreateNote, onClose, onOpenNote, stateRef])
  return { beginDrag, moveDrag, endDrag }
}

interface CanvasHandlers {
  stateRef: RefObject<CanvasState>
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  lastPointerEventAtRef: MutableRefObject<number>
  setHover: (node: CanvasNode | null) => void
  setSelectedId: (id: string | null) => void
  setContext: (value: { x: number; y: number; node: CanvasNode } | null) => void
  beginDrag: (clientX: number, clientY: number, button: number) => void
  moveDrag: (clientX: number, clientY: number) => void
  endDrag: (clientX: number, clientY: number) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  nodeAt: (x: number, y: number) => CanvasNode | null
  fitGraph: () => void
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onClose: () => void
}

function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  if (event.button !== 0) return
  h.lastPointerEventAtRef.current = performance.now()
  event.currentTarget.setPointerCapture(event.pointerId)
  const state = h.stateRef.current
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (state.pointers.size === 1) {
    h.beginDrag(event.clientX, event.clientY, event.button)
  } else if (state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()]
    state.dragging = null
    state.pinch = { distance: Math.hypot(b!.x - a!.x, b!.y - a!.y), scale: state.scale, centerX: (a!.x + b!.x) / 2, centerY: (a!.y + b!.y) / 2 }
  }
}

function handleCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  h.lastPointerEventAtRef.current = performance.now()
  const state = h.stateRef.current
  if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (state.pointers.size >= 2 && state.pinch) {
    const [a, b] = [...state.pointers.values()]
    const distance = Math.hypot(b!.x - a!.x, b!.y - a!.y)
    state.scale = Math.min(4, Math.max(0.2, state.pinch.scale * distance / Math.max(1, state.pinch.distance)))
    state.schedule?.(); return
  }
  h.moveDrag(event.clientX, event.clientY)
}

function handleCanvasPointerUp(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  h.lastPointerEventAtRef.current = performance.now()
  const state = h.stateRef.current
  state.pointers.delete(event.pointerId)
  if (!state.pinch) h.endDrag(event.clientX, event.clientY)
  if (state.pointers.size < 2) state.pinch = null
}

function handleCanvasPointerCancel(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  const state = h.stateRef.current
  state.pointers.delete(event.pointerId)
  state.dragging = null
  state.pinch = null
}

function handleCanvasWheel(event: React.WheelEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  const state = h.stateRef.current
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  const next = graphScaleAfterWheel(state.scale, event.deltaY)
  if (next === state.scale) return
  event.preventDefault()
  state.offsetX = x - (x - state.offsetX) / state.scale * next
  state.offsetY = y - (y - state.offsetY) / state.scale * next
  state.scale = next
  state.schedule?.()
}

function handleCanvasContextMenu(event: React.MouseEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  event.preventDefault()
  const point = h.toWorld(event.clientX, event.clientY)
  const node = h.nodeAt(point.x, point.y)
  if (node) {
    h.setSelectedId(node.id)
    h.setContext({ x: event.clientX, y: event.clientY, node })
  }
}

function handleCanvasMouseLeave(h: CanvasHandlers): void {
  const state = h.stateRef.current
  state.dragging = null
  h.hoverRef.current = null
  h.setHover(null)
  state.schedule?.()
}

function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  const state = h.stateRef.current
  if (event.key === '+' || event.key === '=') {
    state.scale = Math.min(4, state.scale + 0.2)
    event.preventDefault(); state.schedule?.()
    return
  }
  if (event.key === '-') {
    state.scale = Math.max(0.2, state.scale - 0.2)
    event.preventDefault(); state.schedule?.()
    return
  }
  if (event.key === 'Home') {
    h.fitGraph()
    event.preventDefault(); state.schedule?.()
    return
  }
  if (event.key === 'Enter' && h.selectedIdRef.current) {
    const selectedNode = state.nodes.find((node) => node.id === h.selectedIdRef.current)
    if (selectedNode?.kind === 'note') {
      if (usePinnedWindows.getState().focusPinnedByNote(selectedNode.id)) return
      void h.onOpenNote(selectedNode.id)
    } else if (selectedNode) {
      void h.onCreateNote(selectedNode.title)
    }
    if (selectedNode) h.onClose()
    event.preventDefault(); state.schedule?.()
    return
  }
  if (event.key.startsWith('Arrow')) {
    const current = Math.max(0, state.nodes.findIndex((node) => node.id === h.selectedIdRef.current))
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const next = state.nodes[(current + step + state.nodes.length) % state.nodes.length]
    if (next) h.setSelectedId(next.id)
    event.preventDefault(); state.schedule?.()
  }
}

function graphMenuItems(context: { x: number; y: number; node: CanvasNode } | null, onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void, onCreateNote: (title: string) => void, onClose: () => void, onMakeLocal: () => void): MenuItem[] {
  if (!context)
    return []
  const node = context.node
  return [
    { id: 'open', label: node.kind === 'unresolved' ? t('graph.create_note') : t('graph.open_note'), icon: <FolderOpen size={14}/>, onSelect: () => {
      if (node.kind === 'unresolved') void onCreateNote(node.title)
      else void onOpenNote(node.id)
      onClose()
    } },
    { id: 'right', label: t('graph.open_to_right'), icon: <PanelRightClose size={14}/>, disabled: node.kind === 'unresolved', onSelect: () => { void onOpenNote(node.id, { pane: 'secondary' }) } },
    { id: 'local', label: t('graph.make_local_center'), icon: <CircleDot size={14}/>, disabled: node.kind === 'unresolved', separatorBefore: true, onSelect: () => {
      void onOpenNote(node.id)
      onMakeLocal()
    } },
  ]
}

function GraphOverlays({ data, hover, selected, hint }: {
  data: GraphResponse;
  hover: CanvasNode | null;
  selected: GraphResponse['nodes'][number] | null;
  hint: string;
}) {
  const shown = hover ?? selected
  return (
    <>
      {data.meta.truncated && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3 py-1 text-[length:var(--text-11)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
        {t('graph.showing_limit', { shown: data.nodes.length, total: data.meta.totalNodes })}
      </div>}
      {shown && <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3.5 py-1.5 text-[length:var(--text-12)] shadow-[var(--shadow-pop)]">
        <span className="max-w-[50vw] truncate">{shown.title || t('common.untitled_note')}</span>
        <span className="ml-2 text-[var(--text-quaternary)]">{t('graph.direction_counts', { incoming: shown.inDegree, outgoing: shown.outDegree })}</span>
      </div>}
      <div className="pointer-events-none absolute top-3 left-4 hidden text-[length:var(--text-11)] text-[var(--text-quaternary)] md:block">{hint}</div>
    </>
  )
}

function GraphCanvasElement({ canvasRef, handlers }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  handlers: CanvasHandlers;
}) {
  return (
    <canvas ref={canvasRef} tabIndex={0} role="application" aria-label={t('graph.graph_canvas_accessible')}
      className="size-full touch-none cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] active:cursor-grabbing"
      onPointerDown={(event) => handleCanvasPointerDown(event, handlers)}
      onPointerMove={(event) => handleCanvasPointerMove(event, handlers)}
      onPointerUp={(event) => handleCanvasPointerUp(event, handlers)}
      onPointerCancel={(event) => handleCanvasPointerCancel(event, handlers)}
      onMouseDown={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.beginDrag(event.clientX, event.clientY, event.button) }}
      onMouseMove={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.moveDrag(event.clientX, event.clientY) }}
      onMouseUp={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.endDrag(event.clientX, event.clientY) }}
      onMouseLeave={() => handleCanvasMouseLeave(handlers)}
      onContextMenu={(event) => handleCanvasContextMenu(event, handlers)}
      onWheel={(event) => handleCanvasWheel(event, handlers)}
      onKeyDown={(event) => handleCanvasKeyDown(event, handlers)}
    />
  )
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
  const fitGraph = useGraphFit(canvasRef, stateRef)
  useGraphCanvasLoop(data, prefs, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, setHover, setSelectedId, fitGraph)
  const { toWorld, nodeAt } = useGraphWorldMath(stateRef, canvasRef)
  const { beginDrag, moveDrag, endDrag } = useGraphDrag(stateRef, toWorld, nodeAt, hoverRef, setHover, setSelectedId, onOpenNote, onCreateNote, onClose)
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null
  const menuItems = graphMenuItems(context, onOpenNote, onCreateNote, onClose, onMakeLocal)
  const zoomIn = () => {
    const state = stateRef.current
    state.scale = Math.min(4, state.scale + 0.2)
    state.schedule?.()
  }
  const zoomOut = () => {
    const state = stateRef.current
    state.scale = Math.max(0.2, state.scale - 0.2)
    state.schedule?.()
  }
  controlsRef.current = { zoomIn, zoomOut, fit: fitGraph }
  const handlers: CanvasHandlers = {
    stateRef, hoverRef, selectedIdRef, lastPointerEventAtRef,
    setHover, setSelectedId, setContext,
    beginDrag, moveDrag, endDrag, toWorld, nodeAt, fitGraph,
    onOpenNote, onCreateNote, onClose,
  }
  return (
    <>
      <GraphCanvasElement canvasRef={canvasRef} handlers={handlers}/>
      <GraphOverlays data={data} hover={hover} selected={selected} hint={t('graph.interaction_hint')}/>
      <Menu anchor={context ?? { x: 0, y: 0 }} open={Boolean(context)} onClose={() => setContext(null)} items={menuItems} label={t('graph.node_actions')}/>
    </>
  )
}