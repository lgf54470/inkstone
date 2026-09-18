import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './async'

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
