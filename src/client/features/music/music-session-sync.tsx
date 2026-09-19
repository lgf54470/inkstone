import { useEffect } from 'react'
import { hasPlaybackChanged, progressTimeMs, restorePlayback, resumeSleepTimer, savePlayback, schedulePlaybackSave, useMusic, useProgress } from './music-store'

export function MusicSessionSync(): null {
  useEffect(() => {
    const get = () => useMusic.getState()
    resumeSleepTimer(useMusic.setState, get)
    void restorePlayback(useMusic.setState, get)
    // Offline availability is device state living in the service worker cache,
    // so every session has to re-read it before the menu labels can be trusted.
    void useMusic.getState().syncOfflineTracks()
    // The heartbeat lives in the progress store now, so the save scheduler watches
    // both stores and compares its own combined snapshots of queue and position.
    const snapshot = () => {
      const { queue, currentIndex } = useMusic.getState()
      return { queue, currentIndex, currentTimeMs: progressTimeMs() }
    }
    let previous = snapshot()
    // Position drift is measured against the last point a save was scheduled or
    // flushed, so steady listening still persists every POSITION_STEP_MS.
    let savedPositionMs = previous.currentTimeMs
    const check = (): void => {
      const next = snapshot()
      if (hasPlaybackChanged(next, previous, savedPositionMs)) {
        schedulePlaybackSave(get)
        savedPositionMs = next.currentTimeMs
      }
      previous = next
    }
    const unsubscribeLibrary = useMusic.subscribe(check)
    const unsubscribeProgress = useProgress.subscribe(check)
    const flush = (): void => {
      if (document.visibilityState !== 'hidden') return
      savedPositionMs = progressTimeMs()
      void savePlayback(get).catch((error: unknown) => {
        console.warn('[inkstone] music playback save failed:', error)
      })
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribeLibrary()
      unsubscribeProgress()
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
  return null
}
