import { memo, useRef, type MouseEvent, type RefObject } from 'react'
import type { SlideElement, SlidesTheme } from '../types'
import type { ElementPosition } from '../edits'
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
  /** Whether the handles belong to this box (the last one picked) rather than to the ring alone. */
  isPrimary: boolean
  editing: boolean
  /**
   * Where every box this one's drag carries sits right now: itself alone, or the whole selection
   * when it is part of one. Read at the press, which is what keeps a group drag a rigid move.
   */
  targets: ElementPosition[]
  assets?: Record<string, string>
  canvasRef: RefObject<HTMLDivElement | null>
  onSelect?: (id: string | null, additive?: boolean) => void
  onUpdate?: (patch: Partial<SlideElement>) => void
  onMove?: (positions: ElementPosition[]) => void
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
  isPrimary,
  editing,
  targets,
  assets,
  canvasRef,
  onSelect,
  onUpdate,
  onMove,
}: SlideElementBoxProps) {
  const isBackground = isBackgroundLayer(el, page)
  const takesPointer = editable && (!isBackground || isSelected)
  const startDrag = useElementDrag(targets, scale, onMove)

  return (
    <div
      data-slide-element={el.id}
      style={{
        ...getElementBoxStyle(el),
        pointerEvents: elementPointerEvents(el, { editable, isSelected, isBackground }),
      }}
      onMouseDown={(e) => {
        if (!takesPointer) return
        // A held modifier is a selection gesture, not a drag: the click that follows decides
        // whether this box joins the selection or leaves it.
        if (isAdditive(e)) return
        onSelect?.(el.id)
        startDrag(e)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!takesPointer || !isAdditive(e)) return
        onSelect?.(el.id, true)
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
        <SelectionOverlay element={el} scale={scale} onUpdate={onUpdate} canvasRef={canvasRef} handles={isPrimary} />
      )}
    </div>
  )
})

/** ⌘ on a Mac, Ctrl elsewhere, or ⇧ — the three ways a reader says "and this one too". */
function isAdditive(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey
}

/**
 * A drag is a pair of listeners on the window, so it keeps following a fast pointer. What it
 * moves is the list it was handed at the press: each event resolves against those starting
 * positions, so a group stays rigid however many events the pointer produces.
 */
function useElementDrag(
  targets: ElementPosition[],
  scale: number,
  onMove?: (positions: ElementPosition[]) => void,
) {
  const dragRef = useRef<{ startX: number; startY: number; targets: ElementPosition[] } | null>(null)

  return (e: MouseEvent) => {
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startY: e.clientY, targets }

    const onPointerMove = (moveEv: globalThis.MouseEvent) => {
      const drag = dragRef.current
      if (!drag || !onMove) return
      const dx = (moveEv.clientX - drag.startX) / (scale || 1)
      const dy = (moveEv.clientY - drag.startY) / (scale || 1)
      onMove(
        drag.targets.map((target) => ({
          id: target.id,
          x: Math.round(target.x + dx),
          y: Math.round(target.y + dy),
        })),
      )
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
