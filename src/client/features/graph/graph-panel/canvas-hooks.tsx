import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { CircleDot, FolderOpen, PanelRightClose, Pin, Tag } from 'lucide-react'
import { type MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'
import { GRAPH_CLICK_TRAVEL_MAX, PHYSICS_FRAME_LIMIT } from './constants'
import { colorGroupsByNodeId, ensureNodeVisible } from './helpers'
import type { CanvasNode, CanvasState, GraphDragOptions } from './types'

export interface GraphControls {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  /** Put a named node under the reader: the selection, the camera and the announcement of it. */
  selectNode: (id: string) => void
}

export function useGraphCanvasRefs(activeNoteId: string | null = null) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<CanvasNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const activeNoteIdRef = useRef(activeNoteId)
  const lastPointerEventAtRef = useRef(Number.NEGATIVE_INFINITY)
  const stateRef = useRef<CanvasState>({
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0,
    width: 0, height: 0, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null,
    frame: 0, raf: 0, schedule: null,
  })
  const controlsRef = useRef<GraphControls | null>(null)
  return { canvasRef, hoverRef, selectedIdRef, activeNoteIdRef, lastPointerEventAtRef, stateRef, controlsRef }
}

// Read off the document rather than the store: the account menu is out of reach while the graph is
// open, and a follow-the-system flip reaches the attribute without a store change.
export function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark((document.documentElement.dataset.theme ?? 'dark') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
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

export function useGraphWorldMath(stateRef: RefObject<CanvasState>) {
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    return {
      x: (clientX - state.viewLeft - state.offsetX) / state.scale,
      y: (clientY - state.viewTop - state.offsetY) / state.scale,
    }
  }, [stateRef])
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
  useEffect(() => {
    const state = stateRef.current
    if (!state || state.nodes.length === 0) return
    const ruleColors = colorGroupsByNodeId(state.nodes, prefs.colorGroups)
    for (const node of state.nodes) node.colorGroup = ruleColors.get(node.id)?.color ?? null
    state.schedule?.()
  }, [prefs.colorGroups, stateRef])
}

export function useGraphControls(
  controlsRef: MutableRefObject<GraphControls | null>,
  stateRef: RefObject<CanvasState>,
  fitGraph: () => void,
  selectNode: (id: string) => void,
) {
  controlsRef.current = {
    zoomIn: () => { stateRef.current.scale = Math.min(4, stateRef.current.scale + 0.2); stateRef.current.schedule?.() },
    zoomOut: () => { stateRef.current.scale = Math.max(0.2, stateRef.current.scale - 0.2); stateRef.current.schedule?.() },
    fit: fitGraph,
    selectNode,
  }
}

/**
 * The hit set belongs to the frame, not to the response: a search that locates its matches repaints the
 * nodes the layout already holds, so a new building never starts and the positions a reader dragged stay.
 */
export function useGraphSearchDim(stateRef: RefObject<CanvasState>, searchHits: ReadonlySet<string> | null | undefined) {
  useEffect(() => {
    stateRef.current.searchHits = searchHits ?? null
    stateRef.current.schedule?.()
  }, [searchHits, stateRef])
}

/**
 * Putting the search's first hit under the reader: the same path an arrow key takes, so a jumped-to node is
 * selected, kept inside the viewport, and announced like one the reader reached themselves (G-14).
 */
export function useGraphNodeFocus(stateRef: RefObject<CanvasState>, setSelectedId: (id: string) => void) {
  return useCallback((id: string) => {
    const node = stateRef.current.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    setSelectedId(id)
    ensureNodeVisible(stateRef.current, node)
    stateRef.current.schedule?.()
  }, [setSelectedId, stateRef])
}

/**
 * Whether a press has become a drag. Travel is counted on both axes because the reader can move the pointer
 * diagonally while dragging, and this is the one line the click and the card are measured against.
 */
function hasBeenDragged(drag: { startX: number; startY: number }, clientX: number, clientY: number): boolean {
  return Math.abs(clientX - drag.startX) + Math.abs(clientY - drag.startY) > GRAPH_CLICK_TRAVEL_MAX
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
  if (hasBeenDragged(drag, clientX, clientY)) {
    // Letting go after a drag is not a click, so it selects nothing and opens nothing — but the card the
    // drag put away belongs on the node where the reader left it, so the drop hangs it back there (G-16).
    if (drag.node) options.onSelectNode?.(drag.node)
    return
  }
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
  const { stateRef, toWorld, nodeAt, hoverRef, setHover, setSelectedId, onOpenNote, onCreateNote, onDragStart, onNodeDragged, onHoverChange, onSelectNode } = options

  const beginDrag = useCallback((clientX: number, clientY: number, button: number, forcePan = false) => {
    if (button !== 0 && button !== 1) return
    onDragStart?.()
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    const node = (button === 1 || forcePan) ? null : nodeAt(point.x, point.y)
    state.dragging = { node, startX: clientX, startY: clientY, ox: state.offsetX, oy: state.offsetY, cardPutAway: false }
    if (node) {
      setSelectedId(node.id)
      onSelectNode?.(node)
    }
  }, [nodeAt, onDragStart, onSelectNode, setSelectedId, stateRef, toWorld])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    const state = stateRef.current
    const point = toWorld(clientX, clientY)
    const drag = state.dragging
    if (drag) {
      applyDragMove(state, point, clientX, clientY)
      // The card hangs from a place worked out while the node was still under the pointer, and a drag never
      // works it out again: past the click the node is gone from under it, so the drag puts the card away
      // rather than leave it floating over empty canvas (G-16).
      if (drag.node && !drag.cardPutAway && hasBeenDragged(drag, clientX, clientY)) {
        drag.cardPutAway = true
        onNodeDragged?.()
      }
      return
    }
    const node = nodeAt(point.x, point.y)
    if (hoverRef.current?.id !== node?.id) {
      hoverRef.current = node
      setHover(node)
      onHoverChange?.(node)
      state.schedule?.()
    }
  }, [hoverRef, nodeAt, onHoverChange, onNodeDragged, setHover, stateRef, toWorld])

  const endDrag = useCallback((clientX: number, clientY: number, modifierKey = false) => {
    const state = stateRef.current
    const drag = state.dragging
    state.dragging = null
    if (!drag) return
    applyDragEnd(drag, clientX, clientY, { setSelectedId, onSelectNode, onOpenNote, onCreateNote, modifierKey })
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
