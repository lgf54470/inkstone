import { persist } from './persist'
import type { MusicGet, MusicSet } from './types'

// REF-1a: the hub's window size is a preference like the floating card's position, so a
// library that is browsed maximised opens maximised next time instead of shrinking back.
export function setHubMaximized(set: MusicSet, get: MusicGet, maximized: boolean): void {
  set({ hubMaximized: maximized })
  persist(get)
}
