import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { Menu } from '../../../components/overlay'
import { GraphPaintError } from './graph-overlays'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { useMediaQuery } from '../../../lib/hooks'
import { t } from '../../../lib/i18n'
import { getLinkHoverTarget, subscribeLinkHoverTarget } from '../../preview'
import { buildColorLegends, ensureNodeVisible, graphScaleAfterWheel, pickNeighborInDirection, type GraphArrowDirection } from './helpers'
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
  useGraphNodeActions,
  useGraphNodeFocus,
  useGraphPrefsRef,
  useGraphPaintError,
  useGraphWheelZoom,
  useGraphSearchDim,
  useGraphWorldMath,
  useIsDarkTheme,
} from './canvas-hooks'

export type { GraphControls }

interface GraphCanvasProps {
  data: GraphResponse
  prefs: GraphPreferences
  /** The nodes the search box hit, or null while nothing is being located. */
  searchHits?: ReadonlySet<string> | null
  /** The filter line the search box holds, and what to do when a legend row is pressed (G-14 ④). */
  legendQuery?: string
  onLegendSelect?: (query: string) => void
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
  /**
   * The canvas cannot persist a pin of its own — the preferences belong to the panel that owns them — so
   * it reports the change instead. Without this a pin lives exactly as long as the panel does
   * (G-07 step 2). Left unset where a pin is a view of the moment: the note's companion graph.
   */
  onPinChange?: (id: string, pinned: boolean) => void
  /** The note menu can take a note out of the graph; the panel that owns the preferences answers (G-42). */
  onExcludeChange?: (id: string, excluded: boolean) => void
  /** Absent in the graph inside a note: that surface has no tag filter of its own to narrow. */
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
  openNodeMenu: (node: CanvasNode) => void
  beginDrag: (clientX: number, clientY: number, button: number, forcePan?: boolean) => void
  moveDrag: (clientX: number, clientY: number) => void
  endDrag: (clientX: number, clientY: number, modifierKey?: boolean) => void
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  nodeAt: (x: number, y: number) => CanvasNode | null
  fitGraph: () => void
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onClose: () => void
  onFilterByTag?: (tag: string) => void
  /** Speaks to the same live region the selection announcement uses, for keys that answer with words. */
  announce: (message: string) => void
  hover: CanvasNode | null
  isDragging: boolean
}

function useGraphCanvasLoop(options: GraphCanvasLoopOptions) {
  const { data, prefsRef, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, setHover, setSelectedId, fitGraph, onPaintError } = options
  const refitOnSettleRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = stateRef.current
    const colorsRef = { current: readThemeColors() }
    const themeObserver = createThemeObserver(colorsRef, () => state.schedule?.())
    const { resize, observer } = createCanvasResizer(canvas, ctx, state)
    resize()
    const style = getComputedStyle(document.documentElement)
    createGraphTicker({
      state, canvas, ctx, colorsRef, prefsRef, hoverRef, selectedIdRef, activeNoteIdRef, style,
      onSettled: () => {
        if (!refitOnSettleRef.current) return
        refitOnSettleRef.current = false
        fitGraph()
      },
      onPaintError,
    })
    return () => {
      cancelAnimationFrame(state.raf)
      state.raf = 0; state.schedule = null
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [activeNoteIdRef, canvasRef, fitGraph, hoverRef, onPaintError, prefsRef, selectedIdRef, stateRef])

  useEffect(() => {
    const state = stateRef.current
    const known = new Set(state.nodes.map((node) => node.id))
    buildInitialLayout(data, prefsRef.current, state, state.nodes)
    refitOnSettleRef.current = data.nodes.some((node) => !known.has(node.id))
    hoverRef.current = null
    setHover(null)
    setSelectedId((current) => data.nodes.some((node) => node.id === current) ? current : null)
    const linkedTargetId = getLinkHoverTarget()
    const linkedNode = linkedTargetId ? state.nodes.find((candidate) => candidate.id === linkedTargetId) ?? null : null
    if (linkedNode) {
      hoverRef.current = linkedNode
      setHover(linkedNode)
    }
    state.schedule?.()
  }, [data, hoverRef, prefsRef, selectedIdRef, setHover, setSelectedId, stateRef])
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
    const cx = (a!.x + b!.x) / 2 - state.viewLeft
    const cy = (a!.y + b!.y) / 2 - state.viewTop
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
    const cx = (a!.x + b!.x) / 2 - state.viewLeft
    const cy = (a!.y + b!.y) / 2 - state.viewTop
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

function handleCanvasWheel(event: WheelEvent, canvas: HTMLCanvasElement, h: CanvasHandlers): void {
  const state = h.stateRef.current
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  const next = graphScaleAfterWheel(state.scale, event.deltaY)
  if (next === state.scale) return
  event.preventDefault()
  state.offsetX = x - (x - state.offsetX) / state.scale * next
  state.offsetY = y - (y - state.offsetY) / state.scale * next
  state.scale = next
  state.schedule?.()
}

const ARROW_DIRECTIONS: Record<string, GraphArrowDirection> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
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
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    const menuNode = state.nodes.find((node) => node.id === h.selectedIdRef.current)
    if (menuNode) {
      h.openNodeMenu(menuNode)
      event.preventDefault()
    }
    return
  }
  if (event.key === 'Enter' && h.selectedIdRef.current) {
    const selectedNode = state.nodes.find((node) => node.id === h.selectedIdRef.current)
    if (selectedNode) activateSelectedNode(selectedNode, h)
    event.preventDefault(); state.schedule?.(); return
  }
  const direction = ARROW_DIRECTIONS[event.key]
  if (direction) handleCanvasArrowKey(event, state, h, direction)
}

/** What Enter does to the node the reader is on: it opens what can be opened, and filters by what cannot. */
function activateSelectedNode(node: CanvasNode, h: CanvasHandlers): void {
  if (node.kind === 'note') {
    if (usePinnedWindows.getState().focusPinnedByNote(node.id)) return
    void h.onOpenNote(node.id)
    h.onClose()
    return
  }
  if (node.kind === 'unresolved') {
    void h.onCreateNote(node.title)
    h.onClose()
    return
  }
  // A tag node is not something to open, so Enter answers it the way the node actions menu answers the
  // same node: narrow the graph to that tag. Both entries do the one thing (G-24).
  if (!h.onFilterByTag) { h.announce(t('graph.tag_filter_unavailable')); return }
  h.onFilterByTag(node.title)
  h.onClose()
}

function handleCanvasArrowKey(
  event: React.KeyboardEvent<HTMLCanvasElement>,
  state: CanvasState,
  h: CanvasHandlers,
  direction: GraphArrowDirection,
): void {
  // Nothing selected yet: the arrows enter the graph at an end rather than at a neighbour, so the
  // first press always selects a node and always selects the one the key points from.
  const currentIndex = state.nodes.findIndex((node) => node.id === h.selectedIdRef.current)
  const nextIndex = currentIndex < 0
    ? (direction === 'left' || direction === 'up' ? state.nodes.length - 1 : 0)
    : pickNeighborInDirection(state.nodes, currentIndex, direction)
  const next = state.nodes[nextIndex]
  // A direction nothing lies in leaves the selection alone rather than jumping somewhere the key
  // does not point: the node the reader hears stays the node they were on.
  if (next && next.id !== h.selectedIdRef.current) {
    h.setSelectedId(next.id)
    ensureNodeVisible(state, next)
  }
  event.preventDefault(); state.schedule?.()
}

function GraphCanvasElement({ canvasRef, handlers, hintId }: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  handlers: CanvasHandlers
  hintId: string
}) {
  useGraphWheelZoom(canvasRef, (event, canvas) => handleCanvasWheel(event, canvas, handlers))
  const cursorClass = handlers.isDragging
    ? 'cursor-grabbing'
    : handlers.isSpaceDownRef.current
      ? 'cursor-grab'
      : handlers.hover
        ? 'cursor-pointer'
        : 'cursor-grab active:cursor-grabbing'

  return (
    <canvas ref={canvasRef} tabIndex={0} role='application' aria-label={t('graph.graph_canvas_accessible')} aria-describedby={hintId}
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
      onKeyDown={(event) => handleCanvasKeyDown(event, handlers)}
      onKeyUp={(event) => { if (event.key === ' ') handlers.isSpaceDownRef.current = false }}
    />
  )
}

/**
 * What a reader hears about the node the arrows reached. A tag node answers Enter differently from a
 * note, and the only thing on screen that says so is the sigil and the second ring drawn on it — so
 * the announcement names the kind as well, or the two are the same string to a reader (G-24).
 */
function nodeAnnouncement(node: CanvasNode): string {
  const kind = node.kind === 'tag' ? `${t('graph.tag_node')} ` : ''
  const title = node.title || t('common.untitled_note')
  return `${kind}${title}, ${t('graph.direction_counts', { incoming: node.inDegree, outgoing: node.outDegree })}`
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
  const wasSelectedRef = useRef(false)
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
        setLiveAnnouncement(nodeAnnouncement(node))
        preview.showPreview(node)
        wasSelectedRef.current = true
      }
      return
    }
    // Putting a node down is the other half of picking it up, and a live region that only ever announces
    // the last node leaves a reader still holding one they no longer have (G-27).
    if (!wasSelectedRef.current) return
    wasSelectedRef.current = false
    setLiveAnnouncement(t('graph.selection_cleared'))
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

  return { preview, liveAnnouncement, announce: setLiveAnnouncement }
}

/** The legend describes the response, not the physics copy of it, so it must not read stateRef here. */
function useGraphLegends(data: GraphResponse, prefs: GraphPreferences) {
  return useMemo(
    () => buildColorLegends(data.nodes, prefs.groupBy, prefs.colorGroups),
    [data, prefs.groupBy, prefs.colorGroups],
  )
}

function useGraphCanvasController(props: GraphCanvasProps) {
  const { data, prefs, searchHits, activeNoteId, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, lastPointerEventAtRef, onOpenNote, onCreateNote, onClose, onMakeLocal, onFilterByTag, controlsRef } = props
  const [hover, setHover] = useState<CanvasNode | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [context, setContext] = useState<{ x: number; y: number; node: CanvasNode } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const paint = useGraphPaintError(stateRef)
  const isSpaceDownRef = useRef(false)
  const { preview, liveAnnouncement, announce } = useGraphPreviewAndA11y(canvasRef, stateRef, hoverRef, setHover, selectedId, activeNoteId, activeNoteIdRef)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId, selectedIdRef])
  const prefsRef = useGraphPrefsRef(prefs)
  useDynamicGraphPrefs(stateRef, prefs)
  useGraphSearchDim(stateRef, searchHits)
  const fitGraph = useGraphFit(canvasRef, stateRef)
  useGraphCanvasLoop({ data, prefsRef, canvasRef, stateRef, hoverRef, selectedIdRef, activeNoteIdRef, setHover, setSelectedId, fitGraph, onPaintError: paint.reportPaintError })
  const { toWorld, nodeAt } = useGraphWorldMath(stateRef)

  const { beginDrag: origBeginDrag, moveDrag, endDrag: origEndDrag } = useGraphDrag({
    stateRef, toWorld, nodeAt, hoverRef, setHover, setSelectedId, onOpenNote, onCreateNote,
    onDragStart: () => { setIsDragging(true); preview.clearTimers(); preview.closePreview() },
    // The press re-hangs the card that line put away, so the drag has to put it away again (G-16).
    onNodeDragged: () => preview.closePreview(),
    onHoverChange: (node) => preview.onHoverNode(node),
    onSelectNode: (node) => preview.showPreview(node),
  })

  const beginDrag = useCallback((clientX: number, clientY: number, button: number, forcePan?: boolean) => {
    origBeginDrag(clientX, clientY, button, forcePan); setIsDragging(true)
  }, [origBeginDrag])

  const endDrag = useCallback((clientX: number, clientY: number, modifierKey?: boolean) => {
    origEndDrag(clientX, clientY, modifierKey); setIsDragging(false)
  }, [origEndDrag])

  const { openNodeMenu, onTogglePin } = useGraphNodeActions(canvasRef, stateRef, setContext, props.onPinChange, onFilterByTag)
  const menuItems = graphMenuItems({ context, onOpenNote, onCreateNote, onClose, onMakeLocal, onTogglePin: props.onPinChange ? onTogglePin : undefined, onExcludeChange: props.onExcludeChange, excludedNoteIds: prefs.excludedNoteIds, onFilterByTag })
  const selectNode = useGraphNodeFocus(stateRef, setSelectedId)
  useGraphControls(controlsRef, stateRef, fitGraph, selectNode)
  const colorLegends = useGraphLegends(data, prefs)

  const handlers: CanvasHandlers = {
    stateRef, hoverRef, selectedIdRef, lastPointerEventAtRef, isSpaceDownRef,
    setHover, setSelectedId, setContext, openNodeMenu,
    beginDrag, moveDrag, endDrag, toWorld, nodeAt, fitGraph,
    onOpenNote, onCreateNote, onClose, onFilterByTag, announce, hover, isDragging,
  }

  return { handlers, preview, colorLegends, liveAnnouncement, menuItems, hover, selectedId, context, setContext, paint }
}

export function GraphCanvas(props: GraphCanvasProps) {
  const { data, canvasRef } = props
  const b = useGraphCanvasController(props)
  const selected = data.nodes.find((node) => node.id === b.selectedId) ?? null
  const isDark = useIsDarkTheme()
  const hintId = useId()
  // Only a device that says it has a coarse pointer is told about a long press; one that says nothing
  // keeps the sentence the app has always drawn (G-19).
  const isTouchPointer = useMediaQuery('(pointer: coarse)')

  return (
    <>
      <GraphCanvasElement canvasRef={canvasRef} handlers={b.handlers} hintId={hintId}/>
      {b.paint.paintError !== null && <GraphPaintError error={b.paint.paintError} onRetry={b.paint.retryPaint}/>}
      <GraphOverlays
        data={data}
        hover={b.hover}
        selected={selected}
        hint={isTouchPointer ? t('graph.interaction_hint_touch') : t('graph.interaction_hint')}
        hintBrief={isTouchPointer ? t('graph.interaction_hint_touch_brief') : t('graph.interaction_hint_brief')}
        hintId={hintId}
        previewCard={b.preview.previewCard}
        anchorPos={b.preview.anchorPos}
        anchorRef={b.preview.anchorRef}
        isDark={isDark}
        onClosePreview={b.preview.closePreview}
        onEnterPreview={b.preview.pauseHide}
        onLeavePreview={b.preview.resumeHide}
        onPinPreview={b.preview.onPinPreview}
        colorLegends={b.colorLegends}
        legendQuery={props.legendQuery}
        onLegendSelect={props.onLegendSelect}
        liveAnnouncement={b.liveAnnouncement}
      />
      <Menu anchor={b.context ?? { x: 0, y: 0 }} open={Boolean(b.context)} onClose={() => b.setContext(null)} items={b.menuItems} label={t('graph.node_actions')}/>
    </>
  )
}