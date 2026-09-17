import { memo, useRef, type MouseEvent, type RefObject } from 'react'
import type { SlideElement, SlidesTheme } from '../types'
import type { ElementPosition } from '../edits'
import { snapMove, unionBox, type SnapBox, type SnapGuide, type SnapResult } from '../snap'
import type { PageSize } from '../page'
import { elementPointerEvents, getElementBoxStyle, isBackgroundLayer } from './canvas-helpers'
import { SelectionOverlay } from './selection-overlay'
import { ElementRenderer } from './element-renderer'

/** A box a drag is carrying: where it is and how big it is, which is what the snap needs. */
export interface DragTarget {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** What a drag lines up against, and where it reports the lines it used. */
export interface DragSnap {
  /**
   * Every box on the page, the ones being carried included: the drag takes its own out of the
   * list, because the press is what decides what is moving and the render that handed this list
   * over predates that decision — a box left in would be offered its own edges to snap to.
   */
  boxes: Array<SnapBox & { id: string }>
  /** The lines the current move is using; an empty list at the end takes them off the page. */
  report: (guides: SnapGuide[]) => void
}

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
  /** A pan is armed: the page refuses the pointer so the next press moves the view. */
  frozen?: boolean
  /**
   * Where every box this one's drag carries sits right now: itself alone, or the whole selection
   * when it is part of one. Read at the press, which is what keeps a group drag a rigid move and
   * what tells the snap which boxes are moving.
   */
  targets: DragTarget[]
  /** What the page offers to line this drag up with. */
  snap: DragSnap
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
  frozen,
  targets,
  snap,
  assets,
  canvasRef,
  onSelect,
  onUpdate,
  onMove,
}: SlideElementBoxProps) {
  const isBackground = isBackgroundLayer(el, page)
  const takesPointer = editable && !frozen && (!isBackground || isSelected)
  const startDrag = useElementDrag(targets, scale, page, snap, onMove)

  return (
    <div
      data-slide-element={el.id}
      style={{
        ...getElementBoxStyle(el),
        pointerEvents: elementPointerEvents(el, { editable, isSelected, isBackground, frozen }),
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

/** The answer Alt asks for: the move exactly as the pointer gave it, with nothing drawn. */
const FREE_MOVE: SnapResult = { dx: 0, dy: 0, guides: [] }

/**
 * A drag is a pair of listeners on the window, so it keeps following a fast pointer. What it
 * moves is the list it was handed at the press: each event resolves against those starting
 * positions, so a group stays rigid however many events the pointer produces.
 *
 * Each event then asks the page what the move is worth lining up with (snap.ts), and the answer
 * is added to the pointer's own delta before anything is written — so the box that lands on a
 * line was never painted off it. Alt is read per event rather than remembered: letting it go
 * mid-drag brings the guides back.
 */
function useElementDrag(
  targets: DragTarget[],
  scale: number,
  page: PageSize,
  snap: DragSnap,
  onMove?: (positions: ElementPosition[]) => void,
) {
  const dragRef = useRef<{ startX: number; startY: number; targets: DragTarget[] } | null>(null)

  return (e: MouseEvent) => {
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startY: e.clientY, targets }

    const onPointerMove = (moveEv: globalThis.MouseEvent) => {
      const drag = dragRef.current
      if (!drag || !onMove) return
      const dx = (moveEv.clientX - drag.startX) / (scale || 1)
      const dy = (moveEv.clientY - drag.startY) / (scale || 1)
      const snapped = moveEv.altKey
        ? FREE_MOVE
        : resolveSnap(drag.targets, dx, dy, page, snap.boxes)
      snap.report(snapped.guides)
      onMove(
        offsetTargets(drag.targets, dx + snapped.dx, dy + snapped.dy).map((target) => ({
          id: target.id,
          x: target.x,
          y: target.y,
        })),
      )
    }

    const onPointerUp = () => {
      dragRef.current = null
      snap.report([])
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
  }
}

/**
 * What would line up, judged on the rectangle the carried boxes occupy at the proposed move and
 * against the boxes that are staying put. A rotation is not folded in: the geometry is the
 * axis-aligned frame the handles work in.
 */
function resolveSnap(
  targets: DragTarget[],
  dx: number,
  dy: number,
  page: PageSize,
  boxes: Array<SnapBox & { id: string }>,
): SnapResult {
  const carried = new Set(targets.map((target) => target.id))
  const moving = unionBox(offsetTargets(targets, dx, dy))
  if (!moving) return FREE_MOVE
  const others = boxes.filter((candidate) => !carried.has(candidate.id))
  return snapMove({ moving, others, page })
}

function offsetTargets(targets: DragTarget[], dx: number, dy: number): DragTarget[] {
  return targets.map((target) => ({
    ...target,
    x: Math.round(target.x + dx),
    y: Math.round(target.y + dy),
  }))
}
