import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

function useTimerInterval(isPaused: boolean, setNow: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    if (isPaused) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [isPaused, setNow])
}

export function usePresenterTimer(startedAt: number) {
  const [isPaused, setIsPaused] = useState(false)
  const [accumulatedMs, setAccumulatedMs] = useState(0)
  const [lastResumeAt, setLastResumeAt] = useState(() => startedAt)
  const [now, setNow] = useState(() => Date.now())

  const prevStartedAtRef = useRef(startedAt)
  useEffect(() => {
    if (prevStartedAtRef.current !== startedAt) {
      prevStartedAtRef.current = startedAt
      setAccumulatedMs(0)
      setLastResumeAt(startedAt)
      setIsPaused(false)
      setNow(Date.now())
    }
  }, [startedAt])

  useTimerInterval(isPaused, setNow)

  const togglePause = useCallback(() => {
    setIsPaused((currentlyPaused) => {
      const currentTime = Date.now()
      if (currentlyPaused) {
        setLastResumeAt(currentTime)
        setNow(currentTime)
        return false
      }
      if (lastResumeAt !== null) {
        setAccumulatedMs((prev) => prev + Math.max(0, currentTime - lastResumeAt))
      }
      return true
    })
  }, [lastResumeAt])

  const resetTimer = useCallback(() => {
    const currentTime = Date.now()
    setIsPaused(false)
    setAccumulatedMs(0)
    setLastResumeAt(currentTime)
    setNow(currentTime)
  }, [])

  const runningElapsedMs = !isPaused && lastResumeAt !== null ? Math.max(0, now - lastResumeAt) : 0
  const elapsedSeconds = Math.max(0, Math.floor((accumulatedMs + runningElapsedMs) / 1000))

  return { elapsedSeconds, isPaused, togglePause, resetTimer }
}
