import { memo, useCallback, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { SlideElement } from '../types'

interface SelectionOverlayProps {
  element: SlideElement
  scale: number
  onUpdate: (patch: Partial<SlideElement>) => void
  canvasRef: RefObject<HTMLDivElement | null>
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

const MIN_SIZE = 10
const FULL_CIRCLE = 360
const QUARTER_CIRCLE = 90
const HALF_CIRCLE = 180

const HANDLES: Array<{ key: ResizeHandle; className: string }> = [
  { key: 'nw', className: 'absolute -left-1 -top-1 cursor-nwse-resize' },
  { key: 'n', className: 'absolute left-1/2 -top-1 -translate-x-1/2 cursor-ns-resize' },
  { key: 'ne', className: 'absolute -right-1 -top-1 cursor-nesw-resize' },
  { key: 'w', className: 'absolute -left-1 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { key: 'e', className: 'absolute -right-1 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { key: 'sw', className: 'absolute -left-1 -bottom-1 cursor-nesw-resize' },
  { key: 's', className: 'absolute left-1/2 -bottom-1 -translate-x-1/2 cursor-ns-resize' },
  { key: 'se', className: 'absolute -right-1 -bottom-1 cursor-nwse-resize' },
]

function RotationHandle({ onRotateStart }: { onRotateStart: (e: ReactMouseEvent) => void }) {
  return (
    <>
      <div className='absolute left-1/2 -top-4 w-px h-4 -translate-x-1/2 bg-[var(--accent)] pointer-events-none' />
      <div
        onMouseDown={onRotateStart}
        onClick={(e) => e.stopPropagation()}
        className='absolute left-1/2 -top-5 -translate-x-1/2 size-2 bg-white border border-[var(--accent)] rounded-full shadow-xs cursor-grab pointer-events-auto hover:scale-125 transition-transform'
      />
    </>
  )
}

function ResizeHandles({ onResizeStart }: { onResizeStart: (e: ReactMouseEvent, handle: ResizeHandle) => void }) {
  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.key}
          onMouseDown={(e) => onResizeStart(e, h.key)}
          onClick={(e) => e.stopPropagation()}
          className={`${h.className} size-2 bg-white border border-[var(--accent)] rounded-full shadow-xs pointer-events-auto hover:scale-125 transition-transform`}
        />
      ))}
    </>
  )
}

function useResizeGesture(
  element: SlideElement,
  scale: number,
  onUpdate: (patch: Partial<SlideElement>) => void,
) {
  return useCallback(
    (e: ReactMouseEvent, handle: ResizeHandle) => {
      e.stopPropagation()
      e.preventDefault()
      const startX = e.clientX
      const startY = e.clientY
      const { x: origX, y: origY, w: origW, h: origH } = element

      const onPointerMove = (moveEv: globalThis.MouseEvent) => {
        const dx = (moveEv.clientX - startX) / (scale || 1)
        const dy = (moveEv.clientY - startY) / (scale || 1)
        let nextX = origX
        let nextY = origY
        let nextW = origW
        let nextH = origH

        if (handle.includes('e')) nextW = Math.max(MIN_SIZE, Math.round(origW + dx))
        if (handle.includes('s')) nextH = Math.max(MIN_SIZE, Math.round(origH + dy))
        if (handle.includes('w')) {
          const w = Math.max(MIN_SIZE, Math.round(origW - dx))
          nextX = origX + (origW - w)
          nextW = w
        }
        if (handle.includes('n')) {
          const h = Math.max(MIN_SIZE, Math.round(origH - dy))
          nextY = origY + (origH - h)
          nextH = h
        }

        onUpdate({ x: nextX, y: nextY, w: nextW, h: nextH })
      }

      const onPointerUp = () => {
        window.removeEventListener('mousemove', onPointerMove)
        window.removeEventListener('mouseup', onPointerUp)
      }

      window.addEventListener('mousemove', onPointerMove)
      window.addEventListener('mouseup', onPointerUp)
    },
    [element, onUpdate, scale],
  )
}

function useRotateGesture(
  element: SlideElement,
  scale: number,
  canvasRef: RefObject<HTMLDivElement | null>,
  onUpdate: (patch: Partial<SlideElement>) => void,
) {
  return useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const centerX = element.x + element.w / 2
      const centerY = element.y + element.h / 2

      const onPointerMove = (moveEv: globalThis.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const mouseX = (moveEv.clientX - rect.left) / (scale || 1)
        const mouseY = (moveEv.clientY - rect.top) / (scale || 1)
        const rad = Math.atan2(mouseY - centerY, mouseX - centerX)
        let deg = Math.round((rad * HALF_CIRCLE) / Math.PI) + QUARTER_CIRCLE
        if (deg < 0) deg += FULL_CIRCLE
        if (deg >= FULL_CIRCLE) deg -= FULL_CIRCLE
        onUpdate({ rotation: deg })
      }

      const onPointerUp = () => {
        window.removeEventListener('mousemove', onPointerMove)
        window.removeEventListener('mouseup', onPointerUp)
      }

      window.addEventListener('mousemove', onPointerMove)
      window.addEventListener('mouseup', onPointerUp)
    },
    [canvasRef, element.h, element.w, element.x, element.y, onUpdate, scale],
  )
}

export const SelectionOverlay = memo(function SelectionOverlay({
  element,
  scale,
  onUpdate,
  canvasRef,
}: SelectionOverlayProps) {
  const handleResizeStart = useResizeGesture(element, scale, onUpdate)
  const handleRotateStart = useRotateGesture(element, scale, canvasRef, onUpdate)

  return (
    <div className='absolute inset-0 border border-[var(--accent)] pointer-events-none z-30'>
      <RotationHandle onRotateStart={handleRotateStart} />
      <ResizeHandles onResizeStart={handleResizeStart} />
    </div>
  )
})
