import { createStore } from 'zustand/vanilla'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

export interface MusicStoreStub {
  set: MusicSet
  get: MusicGet
  read: () => MusicStoreState
}

// Store actions take the pair Zustand hands them (set, get), so the fixture hands back those same
// two types from a real store rather than a hand-rolled pair: a call site needs no cast, and a
// signature change to an action surfaces as a type error in the test that covers it instead of
// being widened away. Fixtures stay partial on purpose — they carry the data an action reads, not
// the action set the live store holds.
export function musicStoreStub(initial: Partial<MusicStoreState>): MusicStoreStub {
  const store = createStore<MusicStoreState>()(() => initial as MusicStoreState)
  return { set: store.setState, get: store.getState, read: store.getState }
}
