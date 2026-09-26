import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { useMusic } from './music-store'

const FloatingPlayer = lazy(() => import('./music-floating-player').then((m) => ({ default: m.MusicFloatingPlayer })))
const ImmersivePlayer = lazy(() => import('./music-immersive-player').then((m) => ({ default: m.MusicImmersivePlayer })))

// Both surfaces pull in artwork, lyrics, the visualizer and the whole transport
// row, which the shell would otherwise carry into its first load even for a
// session that never plays anything. Each is split off and only fetched once the
// state says it can appear.
export function MusicFloatingPlayer(): ReactNode {
  const visible = useMusic((state) => state.floatingVisible)
  if (!visible) return null
  return (
    <Suspense fallback={null}>
      <FloatingPlayer />
    </Suspense>
  )
}

export function MusicImmersiveOverlay(): ReactNode {
  const immersive = useMusic((state) => state.immersive)
  const setImmersive = useMusic((state) => state.setImmersive)
  // Kept mounted after the first open so closing it still animates out the way
  // the modal did when it was part of the eager tree.
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (immersive) setOpened(true)
  }, [immersive])
  if (!opened) return null
  return (
    <Suspense fallback={null}>
      <ImmersivePlayer open={immersive} onClose={() => setImmersive(false)} />
    </Suspense>
  )
}
