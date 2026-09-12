import { useEffect } from 'react'
import { hasPlaybackChanged, restorePlayback, resumeSleepTimer, savePlayback, schedulePlaybackSave, useMusic } from './music-store'

export function MusicSessionSync(): null {
  useEffect(() => {
    const get = () => useMusic.getState()
    resumeSleepTimer(useMusic.setState, get)
    void restorePlayback(useMusic.setState, get)
    const unsubscribe = useMusic.subscribe((state, previous) => {
      if (hasPlaybackChanged(state, previous)) schedulePlaybackSave(get)
    })
    const flush = (): void => {
      if (document.visibilityState !== 'hidden') return
      void savePlayback(get).catch((error: unknown) => {
        console.warn('[inkstone] music playback save failed:', error)
      })
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
  return null
}
