import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { CircleDot, FolderOpen, PanelRightClose, Pin, Tag } from 'lucide-react'
import { type MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'
import { PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasNode, CanvasState, GraphDragOptions } from './types'

export interface GraphControls {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
}

export function useGraphCanvasRefs(activeNoteId: string | null = null) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<CanvasNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const activeNoteIdRef = useRef(activeNoteId)
  const lastPointerEventAtRef = useRef(Number.NEGATIVE_INFINITY)
  const stateRef = useRef<CanvasState>({
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0,
    width: 0, height: 0,
    dragging: null, pointers: new Map(), pinch: null,
    frame: 0, raf: 0, schedule: null,
  })
  const controlsRef = useRef<GraphControls | null>(null)
  return { canvasRef, hoverRef, selectedIdRef, activeNoteIdRef, lastPointerEventAtRef, stateRef, controlsRef }
}

export function useGraphFit(canvasRef: RefObject<HTMLCanvasElement | null>, stateRef: RefObject<CanvasState>) {
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

export function useGraphWorldMath(stateRef: RefObject<CanvasState>, canvasRef: RefObject<HTMLCanvasElement | null>) {
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

export function useDynamicGraphPrefs(stateRef: RefObject<CanvasState>, prefs: GraphPreferences) {
  useEffect(() => {
    const state = stateRef.current
    if (state && state.nodes.length > 0) {
      state.frame = Math.min(state.frame, PHYSICS_FRAME_LIMIT - 90)
      state.schedule?.()
    }
  }, [prefs.repulsion, prefs.linkDistance, stateRef])
  useEffect(() => {
    const state = stateRef.current
    if (state && state.nodes.length > 0) {
      for (const node of state.nodes) {
        node.r = (4 + Math.min(9, Math.sqrt(node.degree) * 2.4)) * prefs.nodeScale
      }
      state.schedule?.()
    }
  }, [prefs.nodeScale, stateRef])
  useEffect(() => {
    stateRef.current.schedule?.()
  }, [prefs.arrows, prefs.labels, prefs.groupBy, stateRef])
}

export function useGraphControls(controlsRef: MutableRefObject<GraphControls | null>, stateRef: RefObject<CanvasState>, fitGraph: () => void) {
  controlsRef.current = {
    zoomIn: () => { stateRef.current.scale = Math.min(4, stateRef.current.scale + 0.2); stateRef.current.schedule?.() },
    zoomOut: () => { stateRef.current.scale = Math.max(0.2, stateRef.current.scale - 0.2); stateRef.current.schedule?.() },
    fit: fitGraph,
  }
}

function applyDragMove(
  state: CanvasState,
  point: { x: number; y: number },
  clientX: number,
  clientY: number,
): void {
  if (state.dragging?.node) {
    state.dragging.node.x = point.x
    state.dragging.node.y = point.y
    state.dragging.node.vx = 0
    state.dragging.node.vy = 0
    state.frame = Math.min(state.frame, PHYSICS_FRAME_LIMIT - 100)
  } else if (state.dragging) {
    state.offsetX = state.dragging.ox + clientX - state.dragging.startX
    state.offsetY = state.dragging.oy + clientY - state.dragging.startY
  }
  state.schedule?.()
}

function applyDragEnd(
  drag: { node: CanvasNode | null; startX: number; startY: number },
  clientX: number,
  clientY: number,
  options: {
    setSelectedId: (id: string | null) => void
    onSelectNode?: (node: CanvasNode) => void
    onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
    onCreateNote: (title: string) => void
    modifierKey?: boolean
  },
): void {
  const moved = Math.abs(clientX - drag.startX) + Math.abs(clientY - drag.startY)
  if (moved >= 5) return
  if (!drag.node) {
    options.setSelectedId(null)
    return
  }
  options.setSelectedId(drag.node.id)
  options.onSelectNode?.(drag.node)
  if (options.modifierKey) {
    if (drag.node.kind === 'note') void options.onOpenNote(drag.node.id, { pane: 'secondary' })
    else if (drag.node.kind === 'unresolved') void options.onCreateNote(drag.node.title)
  }
}

export function useGraphDrag(options: GraphDragOptions) {
  const { stateRef, toWorld, nodeAt, hoverRef, setHover, setSelectedId, onOpenNote, onCreateNote, onDragStart, onHoverChange, onSelectNode } = options

  const beginDrag = useCallback((clientX: number, clientY: number, button: number, forcePan = false) => {
    if (button !== 0 && button !== 1) return
    onDragStart?.()
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    const node = (button === 1 || forcePan) ? null : nodeAt(point.x, point.y)
    state.dragging = { node, startX: clientX, startY: clientY, ox: state.offsetX, oy: state.offsetY }
    if (node) {
      setSelectedId(node.id)
      onSelectNode?.(node)
    }
  }, [nodeAt, onDragStart, onSelectNode, setSelectedId, stateRef, toWorld])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    if (state.dragging) {
      applyDragMove(state, point, clientX, clientY)
      return
    }
    const node = nodeAt(point.x, point.y)
    if (hoverRef.current?.id !== node?.id) {
      hoverRef.current = node
      setHover(node)
      onHoverChange?.(node)
      state.schedule?.()
    }
  }, [hoverRef, nodeAt, onHoverChange, setHover, stateRef, toWorld])

  const endDrag = useCallback((clientX: number, clientY: number, modifierKey = false) => {
    const state = stateRef.current
    const drag = state.dragging
    state.dragging = null
    if (drag) applyDragEnd(drag, clientX, clientY, { setSelectedId, onSelectNode, onOpenNote, onCreateNote, modifierKey })
  }, [onCreateNote, onOpenNote, onSelectNode, setSelectedId, stateRef])

  return { beginDrag, moveDrag, endDrag }
}

export interface GraphMenuItemsOptions {
  context: { x: number; y: number; node: CanvasNode } | null
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onClose: () => void
  onMakeLocal: () => void
  onTogglePin: (node: CanvasNode) => void
  onFilterByTag?: (tag: string) => void
}

export function graphMenuItems({ context, onOpenNote, onCreateNote, onClose, onMakeLocal, onTogglePin, onFilterByTag }: GraphMenuItemsOptions): MenuItem[] {
  if (!context) return []
  const node = context.node
  const pinItem: MenuItem = { id: 'pin', label: node.pinned ? t('graph.unpin_node') : t('graph.pin_node'), icon: <Pin size={14}/>, onSelect: () => onTogglePin(node) }
  if (node.kind === 'tag') {
    if (!onFilterByTag) return [pinItem]
    return [
      { id: 'filter', label: t('graph.filter_by_tag', { value: node.title }), icon: <Tag size={14}/>, onSelect: () => {
        onFilterByTag(node.title)
        onClose()
      } },
      { ...pinItem, separatorBefore: true },
    ]
  }
  return [
    { id: 'open', label: node.kind === 'unresolved' ? t('graph.create_note') : t('graph.open_note'), icon: <FolderOpen size={14}/>, onSelect: () => {
      if (node.kind === 'unresolved') void onCreateNote(node.title)
      else void onOpenNote(node.id)
      onClose()
    } },
    { id: 'right', label: t('graph.open_to_right'), icon: <PanelRightClose size={14}/>, disabled: node.kind === 'unresolved', onSelect: () => { void onOpenNote(node.id, { pane: 'secondary' }) } },
    pinItem,
    { id: 'local', label: t('graph.make_local_center'), icon: <CircleDot size={14}/>, disabled: node.kind === 'unresolved', separatorBefore: true, onSelect: () => {
      void onOpenNote(node.id)
      onMakeLocal()
    } },
  ]
}
