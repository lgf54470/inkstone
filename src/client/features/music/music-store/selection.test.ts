import { describe, expect, it } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import { clearSelection, invertSelection, selectAll, toggleSelect } from './library-load'

function makeStore() {
  const store = musicStoreStub({ selectedIds: [] })
  return { ...store, selected: () => store.read().selectedIds }
}

describe('selection reducers', () => {
  it('replaces the selection on a plain click and toggles additively otherwise', () => {
    const store = makeStore()
    toggleSelect(store.set, 'a', false)
    expect(store.selected()).toEqual(['a'])
    toggleSelect(store.set, 'b', false)
    expect(store.selected()).toEqual(['b'])
    toggleSelect(store.set, 'c', true)
    expect(store.selected()).toEqual(['b', 'c'])
    toggleSelect(store.set, 'b', true)
    expect(store.selected()).toEqual(['c'])
  })

  it('selects everything visible, inverts it and clears it', () => {
    const store = makeStore()
    selectAll(store.set, ['a', 'b', 'c'])
    expect(store.selected()).toEqual(['a', 'b', 'c'])
    invertSelection(store.set, ['a', 'b', 'c', 'd'])
    expect(store.selected()).toEqual(['d'])
    clearSelection(store.set)
    expect(store.selected()).toEqual([])
  })
})
