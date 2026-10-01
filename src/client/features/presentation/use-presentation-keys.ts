import { useCallback, useEffect, useState } from 'react'
import { presentationCommand, type PresentationCommand } from './presentation-keys'

export type ScreenCoverType = 'black' | 'white' | null

export interface PresentationKeysOptions {
  open: boolean
  slideCount: number
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  toggleFullscreen: () => void
  toggleRail: () => void
  toggleFollowing: () => void
}

function useScreenCover(open: boolean) {
  const [screenCover, setScreenCover] = useState<ScreenCoverType>(null)
  const clearCover = useCallback(() => setScreenCover(null), [])
  const toggleBlackout = useCallback(() => setScreenCover((c) => (c === 'black' ? null : 'black')), [])
  const toggleWhiteout = useCallback(() => setScreenCover((c) => (c === 'white' ? null : 'white')), [])
  useEffect(() => {
    if (!open) setScreenCover(null)
  }, [open])
  return { screenCover, clearCover, toggleBlackout, toggleWhiteout }
}

// The pointer is a mode of the show rather than of the note, so it goes out with the show:
// a talk that ends must not leave a red dot following whoever moves the mouse next.
function useLaserMode(open: boolean) {
  const [laser, setLaser] = useState(false)
  const clearLaser = useCallback(() => setLaser(false), [])
  const toggleLaser = useCallback(() => setLaser((on) => !on), [])
  useEffect(() => {
    if (!open) setLaser(false)
  }, [open])
  return { laser, clearLaser, toggleLaser }
}

// One runner per command keeps the listener itself short, and a command that is not
// claimed leaves the event alone instead of swallowing it for the rest of the page.
function usePresentationRunner(actions: {
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  slideCount: number
  toggleFullscreen: () => void
  toggleRail: () => void
  toggleFollowing: () => void
  toggleBlackout: () => void
  toggleWhiteout: () => void
  toggleLaser: () => void
}) {
  return useCallback((command: PresentationCommand) => {
    switch (command) {
      case 'next':
        return actions.goNext()
      case 'prev':
        return actions.goPrev()
      case 'first':
        return actions.jumpTo(0)
      case 'last':
        return actions.jumpTo(actions.slideCount - 1)
      case 'fullscreen':
        return actions.toggleFullscreen()
      case 'slideList':
        return actions.toggleRail()
      case 'follow':
        return actions.toggleFollowing()
      case 'blackout':
        return actions.toggleBlackout()
      case 'whiteout':
        return actions.toggleWhiteout()
      case 'laser':
        return actions.toggleLaser()
    }
  }, [actions])
}

export function usePresentationKeys(options: PresentationKeysOptions): {
  screenCover: ScreenCoverType
  clearCover: () => void
  laser: boolean
  clearLaser: () => void
} {
  const { open, slideCount, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail, toggleFollowing } = options
  const { screenCover, clearCover, toggleBlackout, toggleWhiteout } = useScreenCover(open)
  const { laser, clearLaser, toggleLaser } = useLaserMode(open)
  const run = usePresentationRunner({ goNext, goPrev, jumpTo, slideCount, toggleFullscreen, toggleRail, toggleFollowing, toggleBlackout, toggleWhiteout, toggleLaser })

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (screenCover) {
      event.preventDefault()
      clearCover()
      return
    }
    const target = event.target as HTMLElement | null
    const command = presentationCommand(event.key, {
      onControl: Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]')),
      onSlideList: Boolean(target?.closest('[data-presentation-rail]')),
    })
    if (!command) return
    event.preventDefault()
    run(command)
  }, [clearCover, run, screenCover])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onKeyDown])

  return { screenCover, clearCover, laser, clearLaser }
}
