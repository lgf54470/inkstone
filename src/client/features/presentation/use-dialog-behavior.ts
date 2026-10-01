import { useCallback, type RefObject } from 'react'
import { useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { escapeAction } from './presentation-state'

// The dialog's own browser contracts: Escape closes, the page behind stops scrolling,
// and focus stays inside the dialog until it goes back to whatever opened it.
// Called after the keyboard hook, because Escape reads the modes that hook owns: the first rung of
// the ladder is whatever screen the presenter is looking at, so neither the overview grid nor the
// laser ever costs a talk its show.
export function useDialogBehavior({ open, panelRef, isFullscreen, toggleFullscreen, onClose, laserOn, clearLaser, overviewOn, clearOverview, spotlightOn, clearSpotlight }: {
  open: boolean
  panelRef: RefObject<HTMLDivElement | null>
  isFullscreen: boolean
  toggleFullscreen: () => void
  onClose: () => void
  laserOn: boolean
  clearLaser: () => void
  overviewOn: boolean
  clearOverview: () => void
  spotlightOn?: boolean
  clearSpotlight?: () => void
}): void {
  const handleEscape = useCallback(() => {
    const action = escapeAction({ fullscreen: isFullscreen, laser: laserOn, overview: overviewOn, spotlight: Boolean(spotlightOn) })
    switch (action) {
      case 'closeOverview':
        return clearOverview()
      case 'clearSpotlight':
        return clearSpotlight?.()
      case 'clearLaser':
        return clearLaser()
      case 'exitFullscreen':
        return toggleFullscreen()
      case 'close':
        return onClose()
    }
  }, [isFullscreen, laserOn, overviewOn, spotlightOn, toggleFullscreen, clearLaser, clearOverview, clearSpotlight, onClose])
  useEscape(open, handleEscape)
  useLockScroll(open)
  useDialogFocus(open, panelRef, panelRef)
}
