import type { GraphNode } from '@shared/types'

export interface CanvasNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export interface CanvasState {
  nodes: CanvasNode[]
  edges: Array<{ a: CanvasNode; b: CanvasNode }>
  scale: number
  offsetX: number
  offsetY: number
  dragging: { node: CanvasNode | null; startX: number; startY: number; ox: number; oy: number } | null
  pointers: Map<number, { x: number; y: number }>
  pinch: { distance: number; scale: number; centerX: number; centerY: number } | null
  frame: number
  raf: number
  schedule: (() => void) | null
}
