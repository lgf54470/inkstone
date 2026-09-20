import type { MutableRefObject } from 'react'

/**
 * Runs one analytics request per hook. The newest call aborts the one before it and
 * owns the loading and error state, so a slow earlier range can neither overwrite
 * the latest answer nor clear its spinner — the same shape as the share page loader.
 */
export async function runLatestAnalyticsRequest<T>(params: {
  requestRef: MutableRefObject<AbortController | null>
  load: (signal: AbortSignal) => Promise<T>
  apply: (value: T) => void
  clear: () => void
  setIsLoading: (value: boolean) => void
  setError: (value: boolean) => void
  logLabel: string
}): Promise<void> {
  const { requestRef, load, apply, clear, setIsLoading, setError, logLabel } = params
  requestRef.current?.abort()
  const controller = new AbortController()
  requestRef.current = controller
  setIsLoading(true)
  setError(false)
  try {
    const value = await load(controller.signal)
    if (!controller.signal.aborted) apply(value)
  } catch (error: unknown) {
    if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return
    clear()
    setError(true)
    console.warn(logLabel, error)
  } finally {
    if (requestRef.current === controller) {
      requestRef.current = null
      setIsLoading(false)
    }
  }
}

/** Aborts whatever analytics request is in flight, e.g. when its view closes. */
export function cancelLatestAnalyticsRequest(requestRef: MutableRefObject<AbortController | null>): void {
  requestRef.current?.abort()
  requestRef.current = null
}
