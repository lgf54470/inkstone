import { create } from 'zustand'

export interface MusicProgressState {
  currentTimeMs: number
}

// The ~250ms audio heartbeat lives here instead of the library store, so a tick
// re-renders only the small leaves that display progress rather than the whole hub.
export const useProgress = create<MusicProgressState>(() => ({ currentTimeMs: 0 }))

export function setProgressTime(ms: number): void {
  useProgress.setState({ currentTimeMs: ms })
}

export function progressTimeMs(): number {
  return useProgress.getState().currentTimeMs
}
