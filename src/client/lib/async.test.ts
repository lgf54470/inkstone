import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout, mapWithConcurrency, throttledProgress } from './async'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe('mapWithConcurrency', () => {
  it('returns results in input order even when work finishes out of order', async () => {
    const gates = [deferred(), deferred(), deferred()]
    const running = mapWithConcurrency([0, 1, 2], 3, async (index) => {
      await gates[index]!.promise
      return index * 10
    })
    gates[2].resolve()
    gates[0].resolve()
    gates[1].resolve()
    expect(await running).toEqual([0, 10, 20])
  })

  it('never keeps more items in flight than the limit', async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 10 }, (_, index) => index)
    const out = await mapWithConcurrency(items, 3, async (index) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 0))
      active -= 1
      return index
    })
    expect(maxActive).toBe(3)
    expect(out).toEqual(items)
  })

  it('rejects with the error of the first failing item', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (index) => {
        if (index === 2) throw new Error('second item failed')
        return index
      }),
    ).rejects.toThrow('second item failed')
  })

  it('resolves an empty list without invoking the work', async () => {
    const fn = (async () => 1) as (item: never, index: number) => Promise<number>
    expect(await mapWithConcurrency([], 4, fn)).toEqual([])
  })
})

describe('throttledProgress', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets the first report through and drops the burst that follows', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const seen: number[] = []
    const report = throttledProgress((percent) => seen.push(percent))
    report(1)
    report(2)
    report(3)
    expect(seen).toEqual([1])
    vi.advanceTimersByTime(250)
    report(4)
    expect(seen).toEqual([1, 4])
  })
})

describe('withTimeout', () => {
  it('passes the value through while it arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'too late')).resolves.toBe(7)
  })

  it('rejects with the caller\'s own sentence when the work never answers', async () => {
    vi.useFakeTimers()
    try {
      const pending = withTimeout(new Promise<number>(() => {}), 500, 'never came')
      const settled = pending.catch((err: unknown) => (err as Error).message)
      await vi.advanceTimersByTimeAsync(500)
      await expect(settled).resolves.toBe('never came')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('carries the work\'s own rejection, not a timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('dropped')), 1000, 'too late')).rejects.toThrow('dropped')
  })
})
