import { memo, useRef, type MouseEvent, type RefObject } from 'react'
import type { SlideElement, SlidesTheme } from '../types'
import type { PageSize } from '../page'
import { elementPointerEvents, getElementBoxStyle, isBackgroundLayer } from './canvas-helpers'
import { SelectionOverlay } from './selection-overlay'
import { ElementRenderer } from './element-renderer'

interface SlideElementBoxProps {
  el: SlideElement
  page: PageSize
  theme: SlidesTheme
  scale: number
  editable: boolean
  isSelected: boolean
  editing: boolean
  assets?: Record<string, string>
  canvasRef: RefObject<HTMLDivElement | null>
  onSelect?: (id: string | null) => void
  onUpdate?: (patch: Partial<SlideElement>) => void
}

/**
 * One element as the pointer meets it: where it sits, whether it takes a click at all, the
 * drag it starts, and the handles a selection grows. It lives apart from the page it is
 * drawn on because those are two different questions — the box knows geometry and gestures,
 * the canvas knows which page is showing and what an edit means — and because a box has to
 * be able to own its own drag without the page listening for it.
 */
export const SlideElementBox = memo(function SlideElementBox({
  el,
  page,
  theme,
  scale,
  editable,
  isSelected,
  editing,
  assets,
  canvasRef,
  onSelect,
  onUpdate,
}: SlideElementBoxProps) {
  const isBackground = isBackgroundLayer(el, page)
  const takesPointer = editable && (!isBackground || isSelected)
  const startDrag = useElementDrag(el, scale, onUpdate)

  return (
    <div
      data-slide-element={el.id}
      style={{
        ...getElementBoxStyle(el),
        pointerEvents: elementPointerEvents(el, { editable, isSelected, isBackground }),
      }}
      onMouseDown={(e) => {
        if (!takesPointer) return
        onSelect?.(el.id)
        startDrag(e)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (takesPointer) onSelect?.(el.id)
      }}
      className={`group transition-shadow ${takesPointer ? 'cursor-move' : ''}`}
    >
      <ElementRenderer
        el={el}
        theme={theme}
        editable={editable}
        isSelected={isSelected}
        editing={editing}
        assets={assets}
        onUpdate={onUpdate}
      />
      {isSelected && onUpdate && (
        <SelectionOverlay element={el} scale={scale} onUpdate={onUpdate} canvasRef={canvasRef} />
      )}
    </div>
  )
})

/** A drag is a pair of listeners on the window, so it keeps following a fast pointer. */
function useElementDrag(
  el: SlideElement,
  scale: number,
  onUpdate?: (patch: Partial<SlideElement>) => void,
) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  return (e: MouseEvent) => {
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y }

    const onPointerMove = (moveEv: globalThis.MouseEvent) => {
      const drag = dragRef.current
      if (!drag || !onUpdate) return
      onUpdate({
        x: Math.round(drag.origX + (moveEv.clientX - drag.startX) / (scale || 1)),
        y: Math.round(drag.origY + (moveEv.clientY - drag.startY) / (scale || 1)),
      })
    }

    const onPointerUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
  }
}
