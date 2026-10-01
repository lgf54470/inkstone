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
  openPresenter?: () => void
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
function usePointerTools(open: boolean) {
  const [tool, setTool] = useState<'laser' | 'spotlight' | null>(null)
  const clearLaser = useCallback(() => setTool((t) => (t === 'laser' ? null : t)), [])
  const clearSpotlight = useCallback(() => setTool((t) => (t === 'spotlight' ? null : t)), [])
  const toggleLaser = useCallback(() => setTool((t) => (t === 'laser' ? null : 'laser')), [])
  const toggleSpotlight = useCallback(() => setTool((t) => (t === 'spotlight' ? null : 'spotlight')), [])
  useEffect(() => {
    if (!open) setTool(null)
  }, [open])
  return { laser: tool === 'laser', spotlight: tool === 'spotlight', clearLaser, clearSpotlight, toggleLaser, toggleSpotlight }
}

// The grid is the same kind of mode: it belongs to the screen, not to the note, and a show that
// ends or a jump that lands has to take it down with it.
function useOverviewMode(open: boolean) {
  const [overview, setOverview] = useState(false)
  const clearOverview = useCallback(() => setOverview(false), [])
  const toggleOverview = useCallback(() => setOverview((on) => !on), [])
  useEffect(() => {
    if (!open) setOverview(false)
  }, [open])
  return { overview, clearOverview, toggleOverview }
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
  toggleSpotlight: () => void
  toggleOverview: () => void
  openPresenter?: () => void
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
      case 'spotlight':
        return actions.toggleSpotlight()
      case 'overview':
        return actions.toggleOverview()
      case 'presenter':
        return actions.openPresenter?.()
    }
  }, [actions])
}

export function usePresentationKeys(options: PresentationKeysOptions): {
  screenCover: ScreenCoverType
  clearCover: () => void
  laser: boolean
  clearLaser: () => void
  spotlight: boolean
  clearSpotlight: () => void
  toggleSpotlight: () => void
  overview: boolean
  clearOverview: () => void
  toggleOverview: () => void
} {
  const { open, slideCount, goNext, goPrev, jumpTo, toggleFullscreen, toggleRail, toggleFollowing, openPresenter } = options
  const { screenCover, clearCover, toggleBlackout, toggleWhiteout } = useScreenCover(open)
  const { laser, clearLaser, toggleLaser, spotlight, clearSpotlight, toggleSpotlight } = usePointerTools(open)
  const { overview, clearOverview, toggleOverview } = useOverviewMode(open)
  const run = usePresentationRunner({ goNext, goPrev, jumpTo, slideCount, toggleFullscreen, toggleRail, toggleFollowing, toggleBlackout, toggleWhiteout, toggleLaser, toggleSpotlight, toggleOverview, openPresenter })

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (screenCover) {
      event.preventDefault()
      clearCover()
      return
    }
    const target = event.target instanceof Element ? event.target : null
    const command = presentationCommand(event.key, {
      onControl: Boolean(target?.closest('button, a, input, select, textarea, [contenteditable="true"]')),
      // Both slide lists walk their own arrows: the rail vertically, the overview grid across rows.
      onSlideList: Boolean(target?.closest('[data-presentation-rail], [data-presentation-overview]')),
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

  return { screenCover, clearCover, laser, clearLaser, spotlight, clearSpotlight, toggleSpotlight, overview, clearOverview, toggleOverview }
}
