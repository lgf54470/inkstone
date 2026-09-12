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

// Listening on the window keeps a container from capturing the pointer, which would swallow every button click inside it.
function useDragListeners(
  isDragging: boolean,
  setIsDragging: (value: boolean) => void,
  setLive: (value: { x: number; y: number } | null) => void,
  originRef: React.RefObject<DragOrigin>,
  clamp: (x: number, y: number) => { x: number; y: number },
  size: { width: number; height: number },
  onCommit: (position: { x: number; y: number }) => void,
  liveRef: React.RefObject<{ x: number; y: number } | null>,
  draggedRef: React.RefObject<boolean>,
): void {
  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: PointerEvent): void => {
      const origin = originRef.current
      const dx = event.clientX - origin.pointerX
      const dy = event.clientY - origin.pointerY
      if (!origin.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
      origin.moved = true
      event.preventDefault()
      setLive(clampToViewport(origin.x + dx, origin.y + dy, size.width, size.height))
    }
    const onUp = (event: PointerEvent): void => {
      const origin = originRef.current
      const moved = origin.moved
      const pending = liveRef.current
      setIsDragging(false)
      origin.moved = false
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
  }, [isDragging, clamp, size, onCommit, liveRef, originRef, setIsDragging, setLive, draggedRef])
}

export interface CardDrag {
  isDragging: boolean
  style: CSSProperties | undefined
  startDrag: (event: React.PointerEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  isClickAfterDrag: () => boolean
}

export function useCardDrag(
  position: { x: number; y: number } | null,
  size: { width: number; height: number },
  onCommit: (position: { x: number; y: number }) => void,
): CardDrag {
  const [live, setLive] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const originRef = useRef<DragOrigin>({ pointerX: 0, pointerY: 0, x: 0, y: 0, moved: false })
  const draggedRef = useRef(false)
  const current = live ?? position
  const liveRef = useRef(live)
  liveRef.current = live

  const clamp = useCallback((x: number, y: number) => clampToViewport(x, y, size.width, size.height), [size.width, size.height])

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const anchor = event.currentTarget.getBoundingClientRect()
    originRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: anchor.left, y: anchor.top, moved: false }
    setIsDragging(true)
  }, [])

  useDragListeners(isDragging, setIsDragging, setLive, originRef, clamp, size, onCommit, liveRef, draggedRef)

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const base = current ?? { x: window.innerWidth - size.width - EDGE_MARGIN_PX, y: window.innerHeight - size.height - EDGE_MARGIN_PX }
    const moves: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: -KEYBOARD_STEP_PX, dy: 0 },
      ArrowRight: { dx: KEYBOARD_STEP_PX, dy: 0 },
      ArrowUp: { dx: 0, dy: -KEYBOARD_STEP_PX },
      ArrowDown: { dx: 0, dy: KEYBOARD_STEP_PX },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onCommit(clamp(base.x + move.dx, base.y + move.dy))
  }, [current, size.width, size.height, clamp, onCommit])

  return {
    isDragging,
    style: current ? { left: current.x, top: current.y, right: 'auto', bottom: 'auto' } : undefined,
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