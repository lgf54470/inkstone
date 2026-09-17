import { describe, expect, it } from 'vitest'
import { historyReducer, type HistoryState } from './history'
import type { BentoDoc } from './types'

function makeDoc(title: string): BentoDoc {
  return {
    format: 'bento/slides',
    version: 1,
    title,
    size: { width: 1280, height: 720 },
    theme: { background: '#000000', color: '#ffffff', accent: '#3b82f6' },
    slides: [],
  }
}

describe('historyReducer', () => {
  it('handles commit and pushes previous state to past', () => {
    const s0: HistoryState = {
      data: makeDoc('Version 1'),
      past: [],
      future: [],
    }

    const s1 = historyReducer(s0, { type: 'commit', next: makeDoc('Version 2') })
    expect(s1.data.title).toBe('Version 2')
    expect(s1.past.length).toBe(1)
    expect(s1.past[0]?.title).toBe('Version 1')
    expect(s1.future.length).toBe(0)
  })

  it('handles undo and restores previous data', () => {
    const doc1 = makeDoc('V1')
    const doc2 = makeDoc('V2')
    const s1: HistoryState = {
      data: doc2,
      past: [doc1],
      future: [],
    }

    const s2 = historyReducer(s1, { type: 'undo' })
    expect(s2.data.title).toBe('V1')
    expect(s2.past.length).toBe(0)
    expect(s2.future.length).toBe(1)
    expect(s2.future[0]?.title).toBe('V2')
  })

  it('handles redo and moves forward in history', () => {
    const doc1 = makeDoc('V1')
    const doc2 = makeDoc('V2')
    const s1: HistoryState = {
      data: doc1,
      past: [],
      future: [doc2],
    }

    const s2 = historyReducer(s1, { type: 'redo' })
    expect(s2.data.title).toBe('V2')
    expect(s2.past.length).toBe(1)
    expect(s2.past[0]?.title).toBe('V1')
    expect(s2.future.length).toBe(0)
  })

  it('no-ops when undoing empty past or redoing empty future', () => {
    const s0: HistoryState = {
      data: makeDoc('V1'),
      past: [],
      future: [],
    }

    const afterUndo = historyReducer(s0, { type: 'undo' })
    expect(afterUndo).toBe(s0)

    const afterRedo = historyReducer(s0, { type: 'redo' })
    expect(afterRedo).toBe(s0)
  })
})
