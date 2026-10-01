import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './index'

/**
 * The graph read is the request whose answer depends on the whole library, so it is the one that can
 * take long enough for a reader to give up on it. The timeout is what turns that wait into a
 * retryable error instead of a promise that never settles.
 */
describe('api.graph request timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('aborts a read that outlives its timeout and reports it as retryable', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal
      // A hung server: the answer never comes, and only the abort ends the wait — as a real fetch does.
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }))

    const pending = api.graph({})
    const settled = pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(signal?.aborted).toBe(true)
    await expect(pending).rejects.toMatchObject({ status: 0, code: 'request_timeout' })
    await settled
  })
})
