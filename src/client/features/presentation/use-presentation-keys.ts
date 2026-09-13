import { useEffect } from 'react'

export interface PresentationKeysOptions {
  open: boolean
  slideCount: number
  goNext: () => void
  goPrev: () => void
  jumpTo: (index: number) => void
  toggleFullscreen: () => void
  toggleRail: () => void
}

// Navigation keys always move slides so a stray focused control can never trap the
// keyboard; Space/Enter yield to the focused control to avoid double actions, and
// the slide list keeps the arrows it needs to walk its own items.
export function usePresentationKeys({ open, slideCount, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail }: PresentationKeysOptions): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const onControl = Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]'))
      const onRail = Boolean(target?.closest('[data-presentation-rail]'))
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault()
          goNext()
          return
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault()
          goPrev()
          return
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Home':
        case 'End':
          if (onRail) return
          event.preventDefault()
          if (event.key === 'ArrowDown') goNext()
          else if (event.key === 'ArrowUp') goPrev()
          else jumpTo(event.key === 'Home' ? 0 : slideCount - 1)
          return
        case ' ':
        case 'Enter':
          if (onControl) return
          event.preventDefault()
          goNext()
          return
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFullscreen()
          return
        case 's':
        case 'S':
          event.preventDefault()
          toggleRail()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, slideCount, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail])
}
