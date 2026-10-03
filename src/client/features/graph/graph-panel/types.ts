import type { MutableRefObject, RefObject, Dispatch, SetStateAction } from 'react'
import type { GraphNode, GraphResponse } from '@shared/types'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { WorkspacePane } from '../../../store/ui'

export interface CanvasNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pinned?: boolean
  /** Resolved from the notes carrying the tag, stamped when the layout is built. */
  tagColor: string | null
  /** Colour of the first custom rule this node matches, or null to fall back to `groupBy`. */
  colorGroup: string | null
}

export interface CanvasState {
  nodes: CanvasNode[]
  edges: Array<{ a: CanvasNode; b: CanvasNode }>
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  /** The canvas box's viewport offset, kept by the resizer: pointer math subtracts it instead of
   * asking the layout engine for the box on every move, which forced a synchronous layout per event. */
  viewLeft: number
  viewTop: number
  /** The press the reader is holding, and where its pointer started. `cardPutAway` remembers that this gesture
   * has already dismissed the preview card, so the moves that follow it do not ask again (G-16). */
  dragging: { node: CanvasNode | null; startX: number; startY: number; ox: number; oy: number; cardPutAway: boolean } | null
  pointers: Map<number, { x: number; y: number }>
  pinch: { distance: number; scale: number; centerX: number; centerY: number } | null
  /** The nodes the search box hit, or null when nothing is being located. Held here rather than passed
   * to the drawing functions because the ticker paints from this object alone (G-14). */
  searchHits: ReadonlySet<string> | null
  frame: number
  raf: number
  schedule: (() => void) | null
}

export interface ThemeColors {
  bgBase: string
  text: string
  edge: string
  node: string
  accent: string
  /** The ten tag colours of the theme, in slot order, read from the --graph-tag-* tokens. */
  tagPalette: string[]
}

export interface DrawArrowHeadOptions {
  ctx: CanvasRenderingContext2D
  from: CanvasNode
  to: CanvasNode
  color: string
  scale: number
}

export interface DrawEdgesOptions {
  ctx: CanvasRenderingContext2D
  state: CanvasState
  colors: ThemeColors
  emphasizedId: string | null
  arrows: boolean
}

export interface DrawNodesOptions {
  ctx: CanvasRenderingContext2D
  state: CanvasState
  colors: ThemeColors
  emphasizedId: string | null
  neighborIds: Set<string>
  groupBy: GraphPreferences['groupBy']
  selectedIdRef: MutableRefObject<string | null>
  activeNoteIdRef: MutableRefObject<string | null>
}

export interface DrawLabelsOptions {
  ctx: CanvasRenderingContext2D
  state: CanvasState
  colors: ThemeColors
  emphasizedId: string | null
  neighborIds: Set<string>
  fontFamily: string
  scale: number
  labels: boolean
}

export interface GraphTickerOptions {
  state: CanvasState
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  colorsRef: MutableRefObject<ThemeColors>
  prefsRef: MutableRefObject<GraphPreferences>
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  activeNoteIdRef: MutableRefObject<string | null>
  style: CSSStyleDeclaration
  onSettled?: () => void
  /** A frame that threw: the loop has stopped by then, so this is the only thing the reader can be told through. */
  onPaintError?: (error: unknown) => void
}

export interface GraphCanvasLoopOptions {
  data: GraphResponse
  prefsRef: MutableRefObject<GraphPreferences>
  canvasRef: RefObject<HTMLCanvasElement | null>
  stateRef: RefObject<CanvasState>
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  activeNoteIdRef: MutableRefObject<string | null>
  setHover: (node: CanvasNode | null) => void
  setSelectedId: Dispatch<SetStateAction<string | null>>
  fitGraph: () => void
  /** Tells the panel the drawing stopped, so it can say so and offer the one way back (G-13). */
  onPaintError: (error: unknown) => void
}

export interface GraphDragOptions {
  stateRef: RefObject<CanvasState>
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  nodeAt: (x: number, y: number) => CanvasNode | null
  hoverRef: MutableRefObject<CanvasNode | null>
  setHover: (node: CanvasNode | null) => void
  setSelectedId: (id: string | null) => void
  onOpenNote: (id: string, options?: { pane?: WorkspacePane; activate?: boolean }) => void
  onCreateNote: (title: string) => void
  onDragStart?: () => void
  /** The node has left the place its preview card was anchored to, once per drag rather than per move (G-16). */
  onNodeDragged?: () => void
  onHoverChange?: (node: CanvasNode | null) => void
  onSelectNode?: (node: CanvasNode) => void
}

export interface GraphHeaderActionsProps {
  hasGraph: boolean
  isSettingsOpen: boolean
  isExporting: boolean
  /** The drawer this control opens, for `aria-controls`. */
  settingsId: string
  /** Focus returns here when the drawer closes, whichever control closed it. */
  settingsButtonRef: RefObject<HTMLButtonElement | null>
  onZoomOut: () => void
  onFit: () => void
  onZoomIn: () => void
  onExportPng: () => void
  onExportSvg: () => void
  onToggleSettings: () => void
  onClose: () => void
}

export interface GraphHeaderProps {
  titleId: string
  data: GraphResponse | null
  prefs: GraphPreferences
  hasActiveNote: boolean
  onModeChange: (mode: GraphPreferences['mode']) => void
  search: string
  onSearchChange: (value: string) => void
  /** What the search box located on the graph already on screen, or null while the box is empty (G-14). */
  searchState: GraphSearchState | null
  onToggleOnlyMatching: () => void
  onJumpToFirstMatch: (id: string) => void
  actions: GraphHeaderActionsProps
}

export interface GraphSearchState {
  /** Notes the line hit, counted on the canvas rather than by a second request. */
  hits: number
  /** The first hit in response order, or null when the line hit nothing to jump to. */
  firstHitId: string | null
  /** The set the canvas fades to, or null when the server was asked to leave only the matches. */
  dimSet: ReadonlySet<string> | null
  isOnlyMatching: boolean
}
