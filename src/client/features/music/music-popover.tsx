import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside, useEscape } from '../../components/overlay'
import { getVisibleViewport } from '../../lib/viewport'
import { cn } from '../../lib/cn'

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 8

interface Placement {
  left: number
  top: number
  width: number | null
  ready: boolean
}

// Anchored panel for the compact transports. It renders through a portal with
// fixed coordinates because the note status bar clips its overflow: an inline
// panel would be invisible there, and the floating card has to escape its own
// stacking context too.
function useAnchoredPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  align: 'start' | 'end',
): Placement {
  const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0, width: null, ready: false })

  useLayoutEffect(() => {
    if (!open) return
    setPlacement((previous) => ({ ...previous, ready: false }))
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const rect = anchor.getBoundingClientRect()
    const box = panel.getBoundingClientRect()
    const viewport = getVisibleViewport()
    const placeAbove = rect.top - box.height - ANCHOR_GAP >= viewport.top + VIEWPORT_MARGIN
    const rawLeft = align === 'end' ? rect.right - box.width : rect.left
    const maxLeft = viewport.right - box.width - VIEWPORT_MARGIN
    setPlacement({
      left: Math.max(viewport.left + VIEWPORT_MARGIN, Math.min(rawLeft, maxLeft)),
      top: placeAbove ? rect.top - box.height - ANCHOR_GAP : rect.bottom + ANCHOR_GAP,
      width: box.width,
      ready: true,
    })
  }, [open, anchorRef, align])

  return placement
}

export function MusicPopover({
  open,
  onClose,
  children,
  label,
  className,
  anchorRef,
  align = 'end',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
  className?: string
  anchorRef: RefObject<HTMLElement | null>
  align?: 'start' | 'end'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const placement = useAnchoredPlacement(open, anchorRef, panelRef, align)

  useClickOutside([panelRef, anchorRef], open, onClose)
  useEscape(open, onClose)
  useCloseOnResize(open, onClose)

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      role='dialog'
      aria-label={label}
      style={{
        left: placement.left,
        top: placement.top,
        width: placement.width ?? undefined,
        visibility: placement.ready ? 'visible' : 'hidden',
      }}
      className={cn(
        'fixed z-[var(--z-pop)] rounded-[var(--r-md)] border border-[var(--border-default)]',
        'bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)]',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

function useCloseOnResize(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', onClose)
    return () => window.removeEventListener('resize', onClose)
  }, [open, onClose])
}
