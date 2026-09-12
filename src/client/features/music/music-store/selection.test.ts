import { describe, expect, it } from 'vitest'
import { clearSelection, invertSelection, selectAll, toggleSelect } from './library-load'
import type { MusicStoreState } from './types'

function makeStore() {
  let state = { selectedIds: [] as string[] } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    selected: () => state.selectedIds,
  }
}

describe('selection reducers', () => {
  it('replaces the selection on a plain click and toggles additively otherwise', () => {
    const store = makeStore()
    toggleSelect(store.set as never, 'a', false)
    expect(store.selected()).toEqual(['a'])
    toggleSelect(store.set as never, 'b', false)
    expect(store.selected()).toEqual(['b'])
    toggleSelect(store.set as never, 'c', true)
    expect(store.selected()).toEqual(['b', 'c'])
    toggleSelect(store.set as never, 'b', true)
    expect(store.selected()).toEqual(['c'])
  })

  it('selects everything visible, inverts it and clears it', () => {
    const store = makeStore()
    selectAll(store.set as never, ['a', 'b', 'c'])
    expect(store.selected()).toEqual(['a', 'b', 'c'])
    invertSelection(store.set as never, ['a', 'b', 'c', 'd'])
    expect(store.selected()).toEqual(['d'])
    clearSelection(store.set as never)
    expect(store.selected()).toEqual([])
  })
})
