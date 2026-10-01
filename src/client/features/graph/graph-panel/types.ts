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
  dragging: { node: CanvasNode | null; startX: number; startY: number; ox: number; oy: number } | null
  pointers: Map<number, { x: number; y: number }>
  pinch: { distance: number; scale: number; centerX: number; centerY: number } | null
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
  colorsRef: ThemeColors | { current: ThemeColors }
  prefsRef: GraphPreferences | { current: GraphPreferences }
  hoverRef: MutableRefObject<CanvasNode | null>
  selectedIdRef: MutableRefObject<string | null>
  activeNoteIdRef: MutableRefObject<string | null>
  style: CSSStyleDeclaration
  onSettled?: () => void
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
  onHoverChange?: (node: CanvasNode | null) => void
  onSelectNode?: (node: CanvasNode) => void
}

export interface GraphHeaderActionsProps {
  hasGraph: boolean
  isSettingsOpen: boolean
  isExporting: boolean
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
  actions: GraphHeaderActionsProps
}
