import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from '../primitives'
import { getVisibleViewport } from '../../lib/viewport'
import { useTooltipAnchor, useTooltipReposition, type TooltipPosition, type TooltipSide } from './use-tooltip'

const GAP = 7
const PADDING = 8

interface ViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
}

function viewportBounds(): ViewportBounds {
  const viewport = getVisibleViewport()
  return { left: viewport.left, top: viewport.top, right: viewport.right, bottom: viewport.bottom }
}

function shouldFlip(anchor: DOMRect, tip: DOMRect, preferred: TooltipSide, vp: ViewportBounds): boolean {
  switch (preferred) {
    case 'bottom':
      return anchor.bottom + GAP + tip.height > vp.bottom - PADDING &&
        (anchor.top - GAP - tip.height >= vp.top + PADDING || anchor.top - vp.top > vp.bottom - anchor.bottom)
    case 'top':
      return anchor.top - GAP - tip.height < vp.top + PADDING &&
        (anchor.bottom + GAP + tip.height <= vp.bottom - PADDING || vp.bottom - anchor.bottom > anchor.top - vp.top)
    case 'right':
      return anchor.right + GAP + tip.width > vp.right - PADDING &&
        (anchor.left - GAP - tip.width >= vp.left + PADDING || anchor.left - vp.left > vp.right - anchor.right)
    case 'left':
      return anchor.left - GAP - tip.width < vp.left + PADDING &&
        (anchor.right + GAP + tip.width <= vp.right - PADDING || vp.right - anchor.right > anchor.left - vp.left)
  }
}

export function Tooltip({ label, combo, children, side = 'bottom', delay = 420, }: {
  label: ReactNode
  combo?: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const { holderRef, show, hide, measureAnchor } = useTooltipAnchor(delay, setPosition, setRect)
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!rect || !tooltip)
      return
    setPosition(placeTooltip(rect, tooltip.getBoundingClientRect(), side))
  }, [combo, label, rect, side])
  useTooltipReposition(rect, measureAnchor, setRect, setPosition)
  const style: React.CSSProperties = position
    ? { top: position.top, left: position.left, visibility: 'visible' }
    : { top: 0, left: 0, visibility: 'hidden' }
  return (<>
    <span ref={holderRef} onMouseEnter={() => {
      if (typeof window.matchMedia !== 'function' || window.matchMedia('(hover: hover) and (pointer: fine)').matches)
        show()
    }} onMouseLeave={hide} onFocus={(event) => {
      if ((event.target as HTMLElement).matches(':focus-visible'))
        show()
    }} onBlur={hide} className='contents'>
      {children}
    </span>
    {rect &&
      createPortal(<div ref={tooltipRef} role='tooltip' data-side={position?.side} className="anim-fade pointer-events-none fixed z-[var(--z-tooltip)] flex max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-overlay)] px-2 py-1 text-[length:var(--text-11\\.5)] whitespace-nowrap text-[var(--text-secondary)] shadow-[var(--shadow-pop)]" style={style}>
        {label}
        {combo && <Kbd combo={combo}/>}
      </div>, document.body)}
  </>)
}
function placeTooltip(anchor: DOMRect, tooltip: DOMRect, preferred: TooltipSide): TooltipPosition {
  const vp = viewportBounds()
  const side = shouldFlip(anchor, tooltip, preferred, vp) ? oppositeSide(preferred) : preferred
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))
  if (side === 'top' || side === 'bottom') {
    return {
      side,
      top: side === 'bottom' ? anchor.bottom + GAP : anchor.top - GAP - tooltip.height,
      left: clamp(anchor.left + anchor.width / 2 - tooltip.width / 2, vp.left + PADDING, vp.right - tooltip.width - PADDING),
    }
  }
  return {
    side,
    top: clamp(anchor.top + anchor.height / 2 - tooltip.height / 2, vp.top + PADDING, vp.bottom - tooltip.height - PADDING),
    left: side === 'right' ? anchor.right + GAP : anchor.left - GAP - tooltip.width,
  }
}

function oppositeSide(side: TooltipSide): TooltipSide {
  switch (side) {
    case 'top': return 'bottom'
    case 'bottom': return 'top'
    case 'left': return 'right'
    case 'right': return 'left'
  }
}