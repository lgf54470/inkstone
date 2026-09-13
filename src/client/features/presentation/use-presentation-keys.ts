import { useCallback, useEffect } from 'react'
import { presentationCommand, type PresentationCommand } from './presentation-keys'

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

export function usePresentationKeys(options: PresentationKeysOptions): void {
  const { open, slideCount, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail, toggleFollowing } = options
  // One runner per command keeps the listener itself short, and a command that is not
  // claimed leaves the event alone instead of swallowing it for the rest of the page.
  const run = useCallback((command: PresentationCommand) => {
    switch (command) {
      case 'next':
        return goNext()
      case 'prev':
        return goPrev()
      case 'first':
        return jumpTo(0)
      case 'last':
        return jumpTo(slideCount - 1)
      case 'fullscreen':
        return toggleFullscreen()
      case 'slideList':
        return toggleRail()
      case 'follow':
        return toggleFollowing()
    }
  }, [goNext, goPrev, jumpTo, slideCount, toggleFullscreen, toggleRail, toggleFollowing])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    const command = presentationCommand(event.key, {
      onControl: Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]')),
      onSlideList: Boolean(target?.closest('[data-presentation-rail]')),
    })
    if (!command) return
    event.preventDefault()
    run(command)
  }, [run])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onKeyDown])
}
