import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { Menu } from '../../../components/overlay'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { t } from '../../../lib/i18n'
import { getLinkHoverTarget, subscribeLinkHoverTarget } from '../../preview'
import { buildColorLegends, graphScaleAfterWheel } from './helpers'
import type { CanvasNode, CanvasState, GraphCanvasLoopOptions } from './types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'
import { buildInitialLayout, createCanvasResizer, createGraphTicker, createThemeObserver, readThemeColors } from './canvas-draw'
import { GraphOverlays } from './graph-overlays'
import { useGraphNodePreview } from './use-graph-preview'
import {
  type GraphControls,
  graphMenuItems,
  useDynamicGraphPrefs,
  useGraphControls,
  useGraphDrag,
  useGraphFit,
  useGraphWorldMath,
} from './canvas-hooks'

export type { GraphControls }

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
  onFilterByTag?: (tag: string) => void
  controlsRef: MutableRefObject<GraphControls | null>
}

interface CanvasHandlers {
  stateRef: RefObject<CanvasState>
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  lastPointerEventAtRef: MutableRefObject<number>
  isSpaceDownRef: MutableRefObject<boolean>
  setHover: (node: CanvasNode | null) => void
  setSelectedId: (id: string | null) => void
  setContext: (value: { x: number; y: number; node: CanvasNode } | null) => void
  beginDrag: (clientX: number, clientY: number, button: number, forcePan?: boolean) => void
  moveDrag: (clientX: number, clientY: number) => void
  endDrag: (clientX: number, clientY: number, modifierKey?: boolean) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  nodeAt: (x: number, y: number) => CanvasNode | null
  fitGraph: () => void
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onClose: () => void
  hover: CanvasNode | null
  isDragging: boolean
}

function useGraphCanvasLoop(options: GraphCanvasLoopOptions) {
  const { data, prefsRef, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, setHover, setSelectedId, fitGraph } = options
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = stateRef.current
    hoverRef.current = null
    setHover(null)
    setSelectedId((current) => data.nodes.some((node) => node.id === current) ? current : null)
    buildInitialLayout(data, prefsRef.current, state)
    const colorsRef = { current: readThemeColors() }
    const themeObserver = createThemeObserver(colorsRef, () => state.schedule?.())
    const { resize, observer } = createCanvasResizer(canvas, ctx, state)
    resize()
    const style = getComputedStyle(document.documentElement)
    createGraphTicker({
      state, canvas, ctx, colorsRef, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style,
      onSettled: fitGraph,
    })
    const linkedTargetId = getLinkHoverTarget()
    const linkedNode = linkedTargetId ? state.nodes.find((candidate) => candidate.id === linkedTargetId) ?? null : null
    hoverRef.current = linkedNode
    setHover(linkedNode)
    state.schedule?.()
    return () => {
      cancelAnimationFrame(state.raf)
      state.raf = 0; state.schedule = null
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [activeNoteIdRef, canvasRef, data, fitGraph, hoverRef, prefsRef, selectedIdRef, setHover, setSelectedId, stateRef])
}

function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  if (event.button !== 0 && event.button !== 1) return
  h.lastPointerEventAtRef.current = performance.now()
  event.currentTarget.setPointerCapture(event.pointerId)
  const state = h.stateRef.current
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (state.pointers.size === 1) {
    h.beginDrag(event.clientX, event.clientY, event.button, h.isSpaceDownRef.current)
  } else if (state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()]
    state.dragging = null
    const rect = event.currentTarget.getBoundingClientRect()
    const cx = (a!.x + b!.x) / 2 - rect.left
    const cy = (a!.y + b!.y) / 2 - rect.top
    state.pinch = { distance: Math.hypot(b!.x - a!.x, b!.y - a!.y), scale: state.scale, centerX: cx, centerY: cy }
  }
}

function handleCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  h.lastPointerEventAtRef.current = performance.now()
  const state = h.stateRef.current
  if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (state.pointers.size >= 2 && state.pinch) {
    const [a, b] = [...state.pointers.values()]
    const distance = Math.hypot(b!.x - a!.x, b!.y - a!.y)
    const rect = event.currentTarget.getBoundingClientRect()
    const cx = (a!.x + b!.x) / 2 - rect.left
    const cy = (a!.y + b!.y) / 2 - rect.top
    const nextScale = Math.min(4, Math.max(0.2, (state.pinch.scale * distance) / Math.max(1, state.pinch.distance)))
    const worldX = (state.pinch.centerX - state.offsetX) / state.scale
    const worldY = (state.pinch.centerY - state.offsetY) / state.scale
    state.scale = nextScale
    state.offsetX = cx - worldX * nextScale
    state.offsetY = cy - worldY * nextScale
    state.pinch.centerX = cx
    state.pinch.centerY = cy
    state.schedule?.()
    return
  }
  h.moveDrag(event.clientX, event.clientY)
}

function handleCanvasDoubleClick(event: React.MouseEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  const point = h.toWorld(event.clientX, event.clientY)
  const node = h.nodeAt(point.x, point.y)
  if (!node) return
  if (node.kind === 'note') {
    if (usePinnedWindows.getState().focusPinnedByNote(node.id)) return
    void h.onOpenNote(node.id)
  } else if (node.kind === 'unresolved') {
    void h.onCreateNote(node.title)
  } else {
    return
  }
  h.onClose()
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

function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>, h: CanvasHandlers): void {
  const state = h.stateRef.current
  if (event.key === ' ') {
    h.isSpaceDownRef.current = true
    event.preventDefault(); return
  }
  if (event.key === '+' || event.key === '=') {
    state.scale = Math.min(4, state.scale + 0.2); event.preventDefault(); state.schedule?.(); return
  }
  if (event.key === '-') {
    state.scale = Math.max(0.2, state.scale - 0.2); event.preventDefault(); state.schedule?.(); return
  }
  if (event.key === 'Home') {
    h.fitGraph(); event.preventDefault(); state.schedule?.(); return
  }
  if (event.key === 'Enter' && h.selectedIdRef.current) {
    const selectedNode = state.nodes.find((node) => node.id === h.selectedIdRef.current)
    if (selectedNode?.kind === 'note') {
      if (usePinnedWindows.getState().focusPinnedByNote(selectedNode.id)) return
      void h.onOpenNote(selectedNode.id)
      h.onClose()
    } else if (selectedNode?.kind === 'unresolved') {
      void h.onCreateNote(selectedNode.title)
      h.onClose()
    }
    event.preventDefault(); state.schedule?.(); return
  }
  if (event.key.startsWith('Arrow')) {
    const current = Math.max(0, state.nodes.findIndex((node) => node.id === h.selectedIdRef.current))
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const next = state.nodes[(current + step + state.nodes.length) % state.nodes.length]
    if (next) h.setSelectedId(next.id)
    event.preventDefault(); state.schedule?.()
  }
}

function GraphCanvasElement({ canvasRef, handlers }: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  handlers: CanvasHandlers
}) {
  const cursorClass = handlers.isDragging
    ? 'cursor-grabbing'
    : handlers.isSpaceDownRef.current
      ? 'cursor-grab'
      : handlers.hover
        ? 'cursor-pointer'
        : 'cursor-grab active:cursor-grabbing'

  return (
    <canvas ref={canvasRef} tabIndex={0} role='application' aria-label={t('graph.graph_canvas_accessible')}
      className={`size-full touch-none ${cursorClass} outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]`}
      onPointerDown={(event) => handleCanvasPointerDown(event, handlers)}
      onPointerMove={(event) => handleCanvasPointerMove(event, handlers)}
      onPointerUp={(event) => {
        handlers.lastPointerEventAtRef.current = performance.now()
        handlers.stateRef.current.pointers.delete(event.pointerId)
        if (!handlers.stateRef.current.pinch) handlers.endDrag(event.clientX, event.clientY, event.metaKey || event.ctrlKey)
        if (handlers.stateRef.current.pointers.size < 2) handlers.stateRef.current.pinch = null
      }}
      onPointerCancel={(event) => {
        handlers.stateRef.current.pointers.delete(event.pointerId)
        handlers.stateRef.current.dragging = null
        handlers.stateRef.current.pinch = null
      }}
      onMouseDown={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.beginDrag(event.clientX, event.clientY, event.button, handlers.isSpaceDownRef.current) }}
      onMouseMove={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.moveDrag(event.clientX, event.clientY) }}
      onMouseUp={(event) => { if (performance.now() - handlers.lastPointerEventAtRef.current > 80) handlers.endDrag(event.clientX, event.clientY, event.metaKey || event.ctrlKey) }}
      onDoubleClick={(event) => handleCanvasDoubleClick(event, handlers)}
      onMouseLeave={() => { handlers.stateRef.current.dragging = null; handlers.hoverRef.current = null; handlers.setHover(null); handlers.stateRef.current.schedule?.() }}
      onContextMenu={(event) => {
        event.preventDefault()
        const point = handlers.toWorld(event.clientX, event.clientY)
        const node = handlers.nodeAt(point.x, point.y)
        if (node) { handlers.setSelectedId(node.id); handlers.setContext({ x: event.clientX, y: event.clientY, node }) }
      }}
      onWheel={(event) => handleCanvasWheel(event, handlers)}
      onKeyDown={(event) => handleCanvasKeyDown(event, handlers)}
      onKeyUp={(event) => { if (event.key === ' ') handlers.isSpaceDownRef.current = false }}
    />
  )
}

function useGraphPreviewAndA11y(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  stateRef: RefObject<CanvasState>,
  hoverRef: MutableRefObject<CanvasNode | null>,
  setHover: (node: CanvasNode | null) => void,
  selectedId: string | null,
  activeNoteId: string | null,
  activeNoteIdRef: MutableRefObject<string | null>,
) {
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const preview = useGraphNodePreview(canvasRef, stateRef)

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
    stateRef.current.schedule?.()
  }, [activeNoteId, activeNoteIdRef, stateRef])

  useEffect(() => {
    stateRef.current.schedule?.()
    if (selectedId) {
      const node = stateRef.current.nodes.find((candidate) => candidate.id === selectedId)
      if (node) {
        setLiveAnnouncement(`${node.title || t('common.untitled_note')}, ${t('graph.direction_counts', { incoming: node.inDegree, outgoing: node.outDegree })}`)
        preview.showPreview(node)
      }
    }
    // `preview` is a fresh object on every render: listing it as a dependency would make this effect write
    // the state that schedules the next render, and the panel would never stop painting.
  }, [selectedId, stateRef, preview.showPreview])

  useEffect(() => subscribeLinkHoverTarget((noteId) => {
    const state = stateRef.current
    const node = noteId ? state.nodes.find((candidate) => candidate.id === noteId) ?? null : null
    hoverRef.current = node
    setHover(node)
    preview.onHoverNode(node)
    state.schedule?.()
  }), [hoverRef, setHover, stateRef, preview.onHoverNode])

  return { preview, liveAnnouncement }
}

/** The legend describes the response, not the physics copy of it, so it must not read stateRef here. */
function useGraphLegends(data: GraphResponse, prefs: GraphPreferences) {
  return useMemo(
    () => buildColorLegends(data.nodes, prefs.groupBy, prefs.colorGroups),
    [data, prefs.groupBy, prefs.colorGroups],
  )
}

function useGraphCanvasController(props: GraphCanvasProps) {
  const { data, prefs, activeNoteId, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, lastPointerEventAtRef, onOpenNote, onCreateNote, onClose, onMakeLocal, onFilterByTag, controlsRef } = props
  const [hover, setHover] = useState<CanvasNode | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [context, setContext] = useState<{ x: number; y: number; node: CanvasNode } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const isSpaceDownRef = useRef(false)
  const { preview, liveAnnouncement } = useGraphPreviewAndA11y(canvasRef, stateRef, hoverRef, setHover, selectedId, activeNoteId, activeNoteIdRef)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId, selectedIdRef])
  const prefsRef = useRef(prefs)
  useEffect(() => { prefsRef.current = prefs }, [prefs])
  useDynamicGraphPrefs(stateRef, prefs)
  const fitGraph = useGraphFit(canvasRef, stateRef)
  useGraphCanvasLoop({ data, prefsRef, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, setHover, setSelectedId, fitGraph })
  const { toWorld, nodeAt } = useGraphWorldMath(stateRef, canvasRef)

  const { beginDrag: origBeginDrag, moveDrag, endDrag: origEndDrag } = useGraphDrag({
    stateRef, toWorld, nodeAt, hoverRef, setHover, setSelectedId, onOpenNote, onCreateNote,
    onDragStart: () => { setIsDragging(true); preview.clearTimers(); preview.closePreview() },
    onHoverChange: (node) => preview.onHoverNode(node),
    onSelectNode: (node) => preview.showPreview(node),
  })

  const beginDrag = useCallback((clientX: number, clientY: number, button: number, forcePan?: boolean) => {
    origBeginDrag(clientX, clientY, button, forcePan); setIsDragging(true)
  }, [origBeginDrag])

  const endDrag = useCallback((clientX: number, clientY: number, modifierKey?: boolean) => {
    origEndDrag(clientX, clientY, modifierKey); setIsDragging(false)
  }, [origEndDrag])

  const onTogglePin = useCallback((node: CanvasNode) => {
    node.pinned = !node.pinned; stateRef.current.schedule?.()
  }, [stateRef])

  const menuItems = graphMenuItems({ context, onOpenNote, onCreateNote, onClose, onMakeLocal, onTogglePin, onFilterByTag })
  useGraphControls(controlsRef, stateRef, fitGraph)
  const colorLegends = useGraphLegends(data, prefs)

  const handlers: CanvasHandlers = {
    stateRef, hoverRef, selectedIdRef, lastPointerEventAtRef, isSpaceDownRef,
    setHover, setSelectedId, setContext,
    beginDrag, moveDrag, endDrag, toWorld, nodeAt, fitGraph,
    onOpenNote, onCreateNote, onClose, hover, isDragging,
  }

  return { handlers, preview, colorLegends, liveAnnouncement, menuItems, hover, selectedId, context, setContext }
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { data, canvasRef } = props
  const b = useGraphCanvasController(props)
  const selected = data.nodes.find((node) => node.id === b.selectedId) ?? null

  return (
    <>
      <GraphCanvasElement canvasRef={canvasRef} handlers={b.handlers}/>
      <GraphOverlays
        data={data}
        hover={b.hover}
        selected={selected}
        hint={t('graph.interaction_hint')}
        previewCard={b.preview.previewCard}
        anchorPos={b.preview.anchorPos}
        anchorRef={b.preview.anchorRef}
        isDark={typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'}
        onClosePreview={b.preview.closePreview}
        onEnterPreview={b.preview.pauseHide}
        onLeavePreview={b.preview.resumeHide}
        onPinPreview={b.preview.onPinPreview}
        colorLegends={b.colorLegends}
        liveAnnouncement={b.liveAnnouncement}
      />
      <Menu anchor={b.context ?? { x: 0, y: 0 }} open={Boolean(b.context)} onClose={() => b.setContext(null)} items={b.menuItems} label={t('graph.node_actions')}/>
    </>
  )
}