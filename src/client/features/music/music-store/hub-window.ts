import { persist } from './persist'
import type { MusicGet, MusicHubGeometry, MusicSet } from './types'

// REF-1a: the hub's window size is a preference like the floating card's position, so a
// library that is browsed maximised opens maximised next time instead of shrinking back.
export function setHubMaximized(set: MusicSet, get: MusicGet, maximized: boolean): void {
  set({ hubMaximized: maximized })
  persist(get)
}

// REF-1b: the windowed hub keeps where the reader put it and how big they made it. A
// stored width or height of zero would collapse the dialog, so both start empty.
export function setHubGeometry(set: MusicSet, get: MusicGet, geometry: MusicHubGeometry): void {
  set({ hubGeometry: geometry })
  persist(get)
}
