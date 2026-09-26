import { describe, expect, it } from 'vitest'
import { createShuffleOrder, orderAfterInsert, orderAfterQueueSync, shuffleStep, syncShuffleOrder } from './music-shuffle'

// Deterministic rng: always draws 0, so Fisher-Yates performs a fixed swap chain.
const ZERO = (): number => 0

describe('createShuffleOrder', () => {
  it('returns a permutation of the queue with the current track first', () => {
    const queue = ['a', 'b', 'c', 'd']
    const order = createShuffleOrder(queue, 'c', ZERO)
    expect([...order].sort()).toEqual([...queue].sort())
    expect(order[0]).toBe('c')
  })

  it('keeps the queue untouched and handles an absent current track', () => {
    const queue = ['a', 'b']
    expect(createShuffleOrder(queue, null, ZERO)).not.toBe(queue)
    expect(createShuffleOrder(queue, 'missing', ZERO)).toHaveLength(2)
  })

  it('is deterministic for a given rng', () => {
    expect(createShuffleOrder(['a', 'b', 'c'], 'a', ZERO)).toEqual(['a', 'b', 'c'])
  })
})

describe('shuffleStep', () => {
  const queue = ['a', 'b', 'c']
  const order = ['c', 'a', 'b']

  it('walks the play order forward and wraps', () => {
    expect(shuffleStep(queue, 'a', order, 1)).toBe(1)
    expect(shuffleStep(queue, 'c', order, 1)).toBe(0)
    expect(shuffleStep(queue, 'b', order, 1)).toBe(2)
  })

  it('walks backwards to the track that actually played before', () => {
    expect(shuffleStep(queue, 'a', order, -1)).toBe(2)
    expect(shuffleStep(queue, 'c', order, -1)).toBe(1)
  })

  it('answers -1 when it cannot step', () => {
    expect(shuffleStep([], 'a', ['a'], 1)).toBe(-1)
    expect(shuffleStep(queue, 'a', ['x', 'y'], 1)).toBe(-1)
    expect(shuffleStep(queue, null, order, 1)).toBe(-1)
    expect(shuffleStep(queue, 'missing', order, -1)).toBe(-1)
  })
})

describe('syncShuffleOrder', () => {
  it('drops removed ids and appends new ones at the end, preserving play order', () => {
    expect(syncShuffleOrder(['c', 'a', 'b'], ['a', 'd', 'c'])).toEqual(['c', 'a', 'd'])
    expect(syncShuffleOrder([], ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('orderAfterQueueSync', () => {
  it('is null outside shuffle mode and when no order exists yet', () => {
    expect(orderAfterQueueSync('order', ['a'], ['a', 'b'])).toBeNull()
    expect(orderAfterQueueSync('shuffle', null, ['a', 'b'])).toBeNull()
  })

  it('syncs an existing order against the next queue', () => {
    expect(orderAfterQueueSync('shuffle', ['c', 'a', 'b'], ['a', 'd', 'c'])).toEqual(['c', 'a', 'd'])
  })
})

describe('orderAfterInsert', () => {
  it('places a play-next insertion right after the current track in play order', () => {
    expect(orderAfterInsert('shuffle', ['c', 'a', 'b'], ['a', 'd', 'b', 'c'], 'a', 'd')).toEqual(['c', 'a', 'd', 'b'])
  })

  it('moves a re-added id and answers null outside shuffle mode', () => {
    expect(orderAfterInsert('shuffle', ['c', 'a', 'b'], ['c', 'a', 'b'], 'a', 'b')).toEqual(['c', 'a', 'b'])
    expect(orderAfterInsert('order', ['c', 'a', 'b'], ['a', 'b'], 'a', 'b')).toBeNull()
  })
})
