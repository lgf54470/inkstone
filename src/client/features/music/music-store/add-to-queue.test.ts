import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', () => ({ api: { music: {} } }))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { toastMusic } from '../music-feedback'
import { addToQueue, moveQueueItem } from './queue-ops'
import type { MusicStoreState } from './types'

function makeStore(queue: string[], currentIndex = 0) {
  let state = { queue, currentIndex } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

describe('addToQueue feedback', () => {
  it('announces the first track that starts the queue', () => {
    const store = makeStore([])
    addToQueue(store.set, store.get, 'a')
    expect(store.state().queue).toEqual(['a'])
    expect(toastMusic).toHaveBeenCalledWith('music.added_to_queue')
  })

  it('announces an appended track even when it was already queued elsewhere', () => {
    vi.mocked(toastMusic).mockClear()
    const store = makeStore(['a', 'b'])
    addToQueue(store.set, store.get, 'a')
    expect(store.state().queue).toEqual(['b', 'a'])
    expect(toastMusic).toHaveBeenCalledWith('music.added_to_queue')
  })

  it('announces the play-next insertion', () => {
    vi.mocked(toastMusic).mockClear()
    const store = makeStore(['x', 'y'], 0)
    addToQueue(store.set, store.get, 'z', true)
    expect(store.state().queue).toEqual(['x', 'z', 'y'])
    expect(toastMusic).toHaveBeenCalledWith('music.added_to_queue')
  })
})

describe('moveQueueItem', () => {
  it('reorders rows and keeps the playing entry pointed at when a row crosses it', () => {
    const store = makeStore(['a', 'b', 'c', 'd'], 1)
    moveQueueItem(store.set, store.get, 0, 2)
    expect(store.state().queue).toEqual(['b', 'c', 'a', 'd'])
    expect(store.state().currentIndex).toBe(0)
  })

  it('follows the playing row itself when it is moved', () => {
    const store = makeStore(['a', 'b', 'c', 'd'], 1)
    moveQueueItem(store.set, store.get, 1, 3)
    expect(store.state().queue).toEqual(['a', 'c', 'd', 'b'])
    expect(store.state().currentIndex).toBe(3)
  })

  it('shifts the playing entry when a later row moves up over it', () => {
    const store = makeStore(['a', 'b', 'c', 'd'], 1)
    moveQueueItem(store.set, store.get, 3, 1)
    expect(store.state().queue).toEqual(['a', 'd', 'b', 'c'])
    expect(store.state().currentIndex).toBe(2)
  })

  it('ignores no-op and out-of-range moves', () => {
    const store = makeStore(['a', 'b'], 0)
    moveQueueItem(store.set, store.get, 1, 1)
    moveQueueItem(store.set, store.get, -1, 0)
    moveQueueItem(store.set, store.get, 0, 2)
    expect(store.state().queue).toEqual(['a', 'b'])
    expect(store.state().currentIndex).toBe(0)
  })
})
