import { useCallback, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { PageSize } from '../page'
import type { SlideElement } from '../types'
import { elementIdsInRect, rectFromPoints, type Rect } from './canvas-helpers'

/** How far a press has to travel before it is a rubber band rather than a click on the backdrop. */
const MARQUEE_THRESHOLD = 3

export interface SlidesMarqueeHost {
  canvasRef: RefObject<HTMLDivElement | null>
  /** Only the editor drags a band: a card in a note has nothing to select. */
  enabled: boolean
  /** The canvas's own zoom, so client pixels become page pixels. */
  scale: number
  elements: SlideElement[]
  page: PageSize
  onSelectMany: (ids: string[]) => void
  /** A press that never travelled, which is the plain click that drops the selection. */
  onClear: () => void
}

export interface SlidesMarquee {
  /** The rectangle to draw while the band is out, or null when there is none. */
  band: Rect | null
  start: (event: ReactMouseEvent<HTMLDivElement>) => void
}

/**
 * The rubber band: a press on the page's own backdrop that travels is a rectangle, and what it
 * caught becomes the selection. A press that does not travel stays the click it always was, which
 * is how the selection is dropped.
 *
 * The gesture lives apart from the canvas that draws it because a band is page-level work — a box
 * cannot draw one across its neighbours, and it never knows what the pointer started on. The
 * corners are converted into page pixels through the canvas's own box, so the band means the same
 * thing at any zoom.
 */
export function useSlidesMarquee(host: SlidesMarqueeHost): SlidesMarquee {
  const [band, setBand] = useState<Rect | null>(null)
  const { canvasRef, elements, enabled, onClear, onSelectMany, page, scale } = host

  const start = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!enabled) return
      const box = canvasRef.current?.getBoundingClientRect()
      if (!box) return
      const at = (clientX: number, clientY: number) => ({
        x: (clientX - box.left) / (scale || 1),
        y: (clientY - box.top) / (scale || 1),
      })
      const start = at(event.clientX, event.clientY)
      let drawn: Rect | null = null

      const onPointerMove = (moveEv: globalThis.MouseEvent) => {
        const end = at(moveEv.clientX, moveEv.clientY)
        const next = rectFromPoints(start, end)
        if (!drawn && next.w < MARQUEE_THRESHOLD && next.h < MARQUEE_THRESHOLD) return
        drawn = next
        setBand(next)
      }

      const onPointerUp = () => {
        window.removeEventListener('mousemove', onPointerMove)
        window.removeEventListener('mouseup', onPointerUp)
        setBand(null)
        if (drawn) onSelectMany(elementIdsInRect(elements, drawn, page))
        else onClear()
      }

      window.addEventListener('mousemove', onPointerMove)
      window.addEventListener('mouseup', onPointerUp)
    },
    [canvasRef, elements, enabled, onClear, onSelectMany, page, scale],
  )

  return { band, start }
}
