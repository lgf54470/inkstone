import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../lib/api'
import { useUi } from '../../../store/ui'
import { useShareStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

function okList() {
  return { shares: [], globalStats: null }
}

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  useUi.setState({ toasts: [] })
  useShareStore.setState({ shares: [], loading: false, error: false, search: '', statusFilter: 'all' })
  vi.clearAllMocks()
  vi.mocked(api.share.list).mockResolvedValue(okList() as never)
})

afterEach(() => {
  // A leaked debounce timer from a failed assertion would fire into the next case.
  useShareStore.setState({ search: '' })
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('share search debounce (SH-18)', () => {
  it('coalesces rapid typing into one request carrying the final term', () => {
    const { setSearch } = useShareStore.getState()
    setSearch('a')
    setSearch('ab')
    setSearch('abc')
    expect(api.share.list).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(api.share.list).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(api.share.list).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.share.list).mock.calls[0]?.[0]).toMatchObject({ search: 'abc' })
  })

  it('an immediate filter change replaces the pending search reload', async () => {
    useShareStore.getState().setSearch('abc')
    useShareStore.getState().setStatusFilter('active')

    expect(api.share.list).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.share.list).mock.calls[0]?.[0]).toMatchObject({ search: 'abc', status: 'active' })

    // Async advancing lets the first load settle first; otherwise in-flight
    // dedup would mask a leaked debounce timer as a harmless duplicate.
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.share.list).toHaveBeenCalledTimes(1)
  })
})

describe('share load cancellation (SH-18)', () => {
  it('aborts the superseded request and never surfaces its rejection', async () => {
    const first = deferred()
    const second = deferred()
    const signals: Array<AbortSignal | undefined> = []
    let call = 0
    vi.mocked(api.share.list).mockImplementation((_params, signal) => {
      signals.push(signal)
      signal?.addEventListener('abort', () => first.reject(new Error('AbortError')))
      call += 1
      return (call === 1 ? first.promise : second.promise) as never
    })

    const p1 = useShareStore.getState().loadShares()
    useShareStore.setState({ search: 'x' })
    const p2 = useShareStore.getState().loadShares()

    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)

    second.resolve(okList())
    await Promise.all([p1, p2])

    expect(useUi.getState().toasts).toHaveLength(0)
    expect(useShareStore.getState().error).toBe(false)
    expect(useShareStore.getState().loading).toBe(false)
  })
})

describe('share load dedup (SH-18)', () => {
  it('reuses the in-flight request when called again with identical params', async () => {
    const pending = deferred()
    vi.mocked(api.share.list).mockReturnValue(pending.promise as never)

    const a = useShareStore.getState().loadShares()
    const b = useShareStore.getState().loadShares()

    expect(api.share.list).toHaveBeenCalledTimes(1)

    pending.resolve(okList())
    await Promise.all([a, b])
    expect(useShareStore.getState().loading).toBe(false)
  })

  it('a completed load does not block the next request with the same params', async () => {
    await useShareStore.getState().loadShares()
    expect(api.share.list).toHaveBeenCalledTimes(1)

    await useShareStore.getState().loadShares()
    expect(api.share.list).toHaveBeenCalledTimes(2)
  })

  it('an aborted run does not free the dedup slot of its replacement', async () => {
    const delays = [deferred(), deferred(), deferred()]
    let call = 0
    vi.mocked(api.share.list).mockImplementation((_params, signal) => {
      const d = delays[call] ?? delays[delays.length - 1]
      call += 1
      signal?.addEventListener('abort', () => d.reject(new Error('AbortError')))
      return d.promise as never
    })

    const p1 = useShareStore.getState().loadShares() // params P
    useShareStore.setState({ search: 'x' })
    const p2 = useShareStore.getState().loadShares() // aborts p1
    useShareStore.setState({ search: '' })
    const p3 = useShareStore.getState().loadShares() // params P again, aborts p2
    expect(call).toBe(3)

    // p1/p2 settling runs their finally hooks while p3 still owns the slot.
    await Promise.all([p1, p2])
    useShareStore.getState().loadShares()
    expect(call).toBe(3)

    delays[2].resolve(okList())
    await p3
  })
})
