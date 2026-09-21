import { useEffect, useRef } from 'react'

/**
 * How often a *visible* dashboard re-asks. Slow on purpose: visit numbers move in minutes, and a
 * faster poll would spend the account's read budget (SH-81) redrawing the same numbers.
 */
export const AUTO_REFRESH_MS = 45_000

// A cadence belongs to the device, not the account: two sessions on two machines can reasonably
// want different windows. It lives in browser storage beside the other local UI choices rather
// than in the user settings document, where it would be an account-wide policy.
const AUTO_REFRESH_KEY = 'inkstone_share_auto_refresh'

export function readAutoRefresh(): boolean {
  try {
    return localStorage.getItem(AUTO_REFRESH_KEY) === '1'
  } catch (error) {
    // Storage can be unavailable (private mode): an unreadable preference means off, and a
    // preference nobody could read is not worth failing a screen over.
    console.warn('[share] could not read the auto refresh preference', error)
    return false
  }
}

export function writeAutoRefresh(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_REFRESH_KEY, enabled ? '1' : '0')
  } catch (error) {
    console.warn('[share] could not store the auto refresh preference', error)
  }
}

/**
 * Polls while the page is in front and stops the moment it is not: a hidden tab asking every 45
 * seconds is pure cost, and the return to the front is exactly when the numbers on screen are
 * most stale — so coming back triggers one read rather than waiting out another interval.
 */
export function useShareAutoRefresh(params: { enabled: boolean; refresh: () => void }): void {
  const { enabled, refresh } = params
  // The caller's closure is rebuilt every render, and an effect keyed on it would tear the timer
  // down and rebuild it on each render — which means it would never fire. The ref keeps the
  // latest one readable at the moment the timer fires.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      timer ??= setInterval(() => refreshRef.current(), AUTO_REFRESH_MS)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop()
        return
      }
      refreshRef.current()
      start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])
}
