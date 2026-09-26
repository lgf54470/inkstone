import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside, useDialogFocus, useEscape } from '../../components/overlay'
import { placePanel } from '../../components/popover-placement'
import { getVisibleViewport } from '../../lib/viewport'
import { cn } from '../../lib/cn'

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
//
// Placement itself is the shared one: this panel measures its own box (its height depends on
// what it holds) and feeds that into `placePanel`, rather than keeping a second copy of the
// flip-and-clamp arithmetic.
function useAnchoredPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  align: 'start' | 'end',
): Placement {
  const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0, width: null, ready: false })

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const box = panel.getBoundingClientRect()
    const next = placePanel({
      anchor: anchor.getBoundingClientRect(),
      size: { width: box.width, height: box.height },
      viewport: getVisibleViewport(),
      align,
      gap: ANCHOR_GAP,
    })
    setPlacement((previous) => (
      previous.ready && previous.left === next.left && previous.top === next.top && previous.width === box.width
        ? previous
        : { left: next.left, top: next.top, width: box.width, ready: true }
    ))
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
  useDialogFocus(open, panelRef)
  useAnchorAria(anchorRef, open)

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      role='dialog'
      aria-label={label}
      tabIndex={-1}
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

// The four anchors are shared IconButtons, which expose no slot for these
// attributes; the panel owns the open state, so it publishes them itself.
function useAnchorAria(anchorRef: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchor.setAttribute('aria-haspopup', 'dialog')
    anchor.setAttribute('aria-expanded', String(open))
  }, [open, anchorRef])
}
