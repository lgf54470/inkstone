import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const EDGE_MARGIN_PX = 8
const KEYBOARD_STEP_PX = 16
const DRAG_THRESHOLD_PX = 4

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

interface DragOrigin extends Point {
  pointerX: number
  pointerY: number
  moved: boolean
}

export interface CardDrag {
  isDragging: boolean
  style: CSSProperties | undefined
  startDrag: (event: React.PointerEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  isClickAfterDrag: () => boolean
}

const KEYBOARD_DELTAS: Record<string, Point> = {
  ArrowLeft: { x: -KEYBOARD_STEP_PX, y: 0 },
  ArrowRight: { x: KEYBOARD_STEP_PX, y: 0 },
  ArrowUp: { x: 0, y: -KEYBOARD_STEP_PX },
  ArrowDown: { x: 0, y: KEYBOARD_STEP_PX },
}

/** 视口内钳制并留出边缘间距，纯函数便于测试 */
export function clampPosition(position: Point, size: Size, viewport: Size): Point {
  const maxX = Math.max(EDGE_MARGIN_PX, viewport.width - size.width - EDGE_MARGIN_PX)
  const maxY = Math.max(EDGE_MARGIN_PX, viewport.height - size.height - EDGE_MARGIN_PX)
  return {
    x: Math.min(Math.max(position.x, EDGE_MARGIN_PX), maxX),
    y: Math.min(Math.max(position.y, EDGE_MARGIN_PX), maxY),
  }
}

/** 方向键按固定步长移动，保证拖拽之外的键盘可达路径 */
export function keyboardPosition(base: Point, key: string, size: Size, viewport: Size): Point | null {
  const delta = KEYBOARD_DELTAS[key]
  if (!delta) return null
  return clampPosition({ x: base.x + delta.x, y: base.y + delta.y }, size, viewport)
}

/** 图片与链接默认可原生拖拽，会截断指针事件，拖拽把手里的内容一律禁止 */
export function preventNativeDrag(event: React.DragEvent<HTMLElement>): void {
  event.preventDefault()
}

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight }
}

// 事件可能来自卡片内部的把手，几何基准要取整块控件的矩形
function rootRect(target: HTMLElement): DOMRect {
  return (target.closest('[data-drag-root]') ?? target).getBoundingClientRect()
}

function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height
}

/** 测量悬浮控件实际尺寸，拖动钳制要用到，布局变化时同步 */
export function useMeasuredSize(fallback: Size): { ref: (node: HTMLElement | null) => void; size: Size } {
  const [size, setSize] = useState<Size>(fallback)
  const observerRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => {
      const next = { width: node.offsetWidth, height: node.offsetHeight }
      setSize((previous) => (sameSize(previous, next) ? previous : next))
    })
    observer.observe(node)
    observerRef.current = observer
  }, [])
  useEffect(() => () => observerRef.current?.disconnect(), [])
  return { ref, size }
}

interface DragListenersOptions {
  isDragging: boolean
  originRef: React.RefObject<DragOrigin>
  liveRef: React.RefObject<Point | null>
  draggedRef: React.RefObject<boolean>
  size: Size
  setIsDragging: (value: boolean) => void
  setLive: (value: Point | null) => void
  onCommit: (position: Point) => void
}

// 监听挂在 window 上：容器一旦捕获指针，内部按钮就再也收不到点击
function useDragListeners(options: DragListenersOptions): void {
  const { isDragging, originRef, liveRef, draggedRef, size, setIsDragging, setLive, onCommit } = options
  useEffect(() => {
    if (!isDragging) return
    const clamp = (point: Point): Point => clampPosition(point, size, viewportSize())
    const onMove = (event: PointerEvent): void => {
      const origin = originRef.current
      const dx = event.clientX - origin.pointerX
      const dy = event.clientY - origin.pointerY
      if (!origin.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      origin.moved = true
      event.preventDefault()
      setLive(clamp({ x: origin.x + dx, y: origin.y + dy }))
    }
    const onUp = (event: PointerEvent): void => {
      const origin = originRef.current
      const moved = origin.moved
      const pending = liveRef.current
      setIsDragging(false)
      origin.moved = false
      if (!moved) {
        setLive(null)
        return
      }
      // 拖动后控件仍在指针下，随后的 click 会误触内部按钮，这里吞掉这一次点击
      draggedRef.current = true
      window.setTimeout(() => {
        draggedRef.current = false
      }, 0)
      const released = event.type === 'pointerup'
        ? clamp({ x: origin.x + event.clientX - origin.pointerX, y: origin.y + event.clientY - origin.pointerY })
        : pending ?? { x: origin.x, y: origin.y }
      onCommit(released)
      setLive(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, originRef, liveRef, draggedRef, size, setIsDragging, setLive, onCommit])
}

export function useCardDrag(
  position: Point | null,
  size: Size,
  onCommit: (position: Point) => void,
): CardDrag {
  const [live, setLive] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const originRef = useRef<DragOrigin>({ pointerX: 0, pointerY: 0, x: 0, y: 0, moved: false })
  const liveRef = useRef<Point | null>(null)
  const draggedRef = useRef(false)
  const current = live ?? position
  liveRef.current = live

  useDragListeners({ isDragging, originRef, liveRef, draggedRef, size, setIsDragging, setLive, onCommit })

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // 首次拖动前控件停在右下角默认位置，取实际矩形作为起点，避免跳动
    const rect = rootRect(event.currentTarget)
    originRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: current?.x ?? rect.left,
      y: current?.y ?? rect.top,
      moved: false,
    }
    setIsDragging(true)
  }, [current])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const rect = rootRect(event.currentTarget)
    const base = current ?? { x: rect.left, y: rect.top }
    const next = keyboardPosition(base, event.key, size, viewportSize())
    if (!next) return
    event.preventDefault()
    onCommit(next)
  }, [current, size, onCommit])

  return {
    isDragging,
    style: current ? { left: current.x, top: current.y } : undefined,
    startDrag,
    onKeyDown,
    isClickAfterDrag: () => draggedRef.current,
  }
}
