import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', () => ({ api: { music: {} } }))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { toastMusic } from '../music-feedback'
import { addToQueue } from './player'
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
