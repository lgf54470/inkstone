import { useCallback, useMemo, useState } from 'react'
import { useContextMenu } from '../../components/overlay'
import type { TrackMenuTarget } from './music-track-menu'
import type { TrackRowHandlers } from './music-track-row'

interface TrackMenuState {
  target: TrackMenuTarget | null
  anchor: { x: number; y: number }
  open: boolean
  onClose: () => void
}

/**
 * The menu a right click on a row or a card opens, and the handlers the rows share. The
 * handlers are one object for the whole list on purpose: a fresh one per row would give
 * every row new props on every render and the memo on the row would never hold.
 */
export function useTrackMenu(handlers: TrackRowHandlers): { menu: TrackMenuState; rowHandlers: TrackRowHandlers } {
  const contextMenu = useContextMenu()
  const [target, setTarget] = useState<TrackMenuTarget | null>(null)
  const openMenu = useCallback((event: React.MouseEvent, next: TrackMenuTarget) => {
    setTarget(next)
    contextMenu.onContextMenu(event)
  }, [contextMenu])
  const closeMenu = useCallback(() => {
    setTarget(null)
    contextMenu.close()
  }, [contextMenu])
  const rowHandlers = useMemo(() => ({ ...handlers, onContextMenu: openMenu }), [handlers, openMenu])
  const menu = useMemo<TrackMenuState>(
    () => ({
      target,
      anchor: contextMenu.point ?? { x: 0, y: 0 },
      open: Boolean(contextMenu.point) && Boolean(target),
      onClose: closeMenu,
    }),
    [target, contextMenu.point, closeMenu],
  )
  return { menu, rowHandlers }
}
