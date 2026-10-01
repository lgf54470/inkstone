import { useCallback, type RefObject } from 'react'
import { useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { escapeAction } from './presentation-state'

// The dialog's own browser contracts: Escape closes, the page behind stops scrolling,
// and focus stays inside the dialog until it goes back to whatever opened it.
// Called after the keyboard hook, because Escape reads the pointer mode that hook owns:
// putting the laser out is the first rung of the escape ladder.
export function useDialogBehavior({ open, panelRef, isFullscreen, toggleFullscreen, onClose, laserOn, clearLaser }: {
  open: boolean
  panelRef: RefObject<HTMLDivElement | null>
  isFullscreen: boolean
  toggleFullscreen: () => void
  onClose: () => void
  laserOn: boolean
  clearLaser: () => void
}): void {
  const handleEscape = useCallback(() => {
    const action = escapeAction(isFullscreen, laserOn)
    if (action === 'clearLaser') clearLaser()
    else if (action === 'exitFullscreen') toggleFullscreen()
    else onClose()
  }, [isFullscreen, laserOn, toggleFullscreen, clearLaser, onClose])
  useEscape(open, handleEscape)
  useLockScroll(open)
  useDialogFocus(open, panelRef, panelRef)
}
