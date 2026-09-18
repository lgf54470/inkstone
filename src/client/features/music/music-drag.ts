import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const EDGE_MARGIN_PX = 8
const KEYBOARD_STEP_PX = 16
const DRAG_THRESHOLD_PX = 4

interface DragOrigin {
  pointerX: number
  pointerY: number
  x: number
  y: number
  moved: boolean
}

export function clampToViewport(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX)),
    y: Math.min(Math.max(y, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX)),
  }
}

interface DragListeners {
  isDragging: boolean
  setIsDragging: (value: boolean) => void
  size: { width: number; height: number }
  onCommit: (position: { x: number; y: number }) => void
  originRef: React.RefObject<DragOrigin>
  liveRef: React.RefObject<{ x: number; y: number } | null>
  nodeRef: React.RefObject<HTMLElement | null>
  draggedRef: React.RefObject<boolean>
}

// Pointer events arrive at 60-120Hz; writing the element style directly keeps the card
// under the cursor without a React render per move, and only the release commits to state.
function showPosition(liveRef: DragListeners['liveRef'], nodeRef: DragListeners['nodeRef'], x: number, y: number): void {
  liveRef.current = { x, y }
  const node = nodeRef.current
  if (!node) return
  node.style.left = x + 'px'
  node.style.top = y + 'px'
  node.style.right = 'auto'
  node.style.bottom = 'auto'
}

function useDragListeners({ isDragging, setIsDragging, size, onCommit, originRef, liveRef, nodeRef, draggedRef }: DragListeners): void {
  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: PointerEvent): void => {
      const origin = originRef.current
      const dx = event.clientX - origin.pointerX
      const dy = event.clientY - origin.pointerY
      if (!origin.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      origin.moved = true
      event.preventDefault()
      const target = clampToViewport(origin.x + dx, origin.y + dy, size.width, size.height)
      showPosition(liveRef, nodeRef, target.x, target.y)
    }
    const onUp = (event: PointerEvent): void => {
      const origin = originRef.current
      const moved = origin.moved
      const pending = liveRef.current
      setIsDragging(false)
      origin.moved = false
      liveRef.current = null
      if (moved) {
        // The dragged element follows the cursor, so the release still lands on it
        // and would fire a click. Swallow that one click after a real drag.
        draggedRef.current = true
        window.setTimeout(() => { draggedRef.current = false }, 0)
      }
      if (moved && event.type === 'pointerup') {
        onCommit(clampToViewport(origin.x + event.clientX - origin.pointerX, origin.y + event.clientY - origin.pointerY, size.width, size.height))
      } else if (moved && pending) {
        onCommit(pending)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, setIsDragging, size, onCommit, originRef, liveRef, nodeRef, draggedRef])
}

export interface CardDrag {
  isDragging: boolean
  style: CSSProperties | undefined
  setNode: (node: HTMLElement | null) => void
  startDrag: (event: React.PointerEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  isClickAfterDrag: () => boolean
}

export function useCardDrag(
  position: { x: number; y: number } | null,
  size: { width: number; height: number },
  onCommit: (position: { x: number; y: number }) => void,
): CardDrag {
  const [isDragging, setIsDragging] = useState(false)
  const originRef = useRef<DragOrigin>({ pointerX: 0, pointerY: 0, x: 0, y: 0, moved: false })
  const draggedRef = useRef(false)
  const liveRef = useRef<{ x: number; y: number } | null>(null)
  const nodeRef = useRef<HTMLElement | null>(null)

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
  }, [])

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const anchor = event.currentTarget.getBoundingClientRect()
    originRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: anchor.left, y: anchor.top, moved: false }
    setIsDragging(true)
  }, [])

  useDragListeners({ isDragging, setIsDragging, size, onCommit, originRef, liveRef, nodeRef, draggedRef })

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const base = position ?? { x: window.innerWidth - size.width - EDGE_MARGIN_PX, y: window.innerHeight - size.height - EDGE_MARGIN_PX }
    const moves: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: -KEYBOARD_STEP_PX, dy: 0 },
      ArrowRight: { dx: KEYBOARD_STEP_PX, dy: 0 },
      ArrowUp: { dx: 0, dy: -KEYBOARD_STEP_PX },
      ArrowDown: { dx: 0, dy: KEYBOARD_STEP_PX },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onCommit(clampToViewport(base.x + move.dx, base.y + move.dy, size.width, size.height))
  }, [position, size.width, size.height, onCommit])

  return {
    isDragging,
    style: position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined,
    setNode,
    startDrag,
    onKeyDown,
    isClickAfterDrag: () => draggedRef.current,
  }
}

// The card is dragged by a handle inside it, so the clamp has to track the card
// box itself: a fixed size would let either variant hang off-screen.
export function useMeasuredSize(fallback: { width: number; height: number }): {
  ref: (node: HTMLElement | null) => void
  size: { width: number; height: number }
} {
  const [size, setSize] = useState(fallback)
  const observerRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    const measure = (): void => {
      const rect = node.getBoundingClientRect()
      setSize((previous) => (previous.width === rect.width && previous.height === rect.height
        ? previous
        : { width: rect.width, height: rect.height }))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observerRef.current = observer
    measure()
  }, [])
  return { ref, size }
}
