import { createElement } from 'react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../test-render'
import { historyReducer, useSlidesHistory, type HistoryState } from './history'
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

  it('adopts a document another surface wrote and restarts the history', () => {
    const mine = makeDoc('Edited here')
    const theirs = makeDoc('Edited in full screen')
    const s1: HistoryState = { data: mine, past: [makeDoc('V0')], future: [] }

    const s2 = historyReducer(s1, { type: 'adopt', next: theirs })
    expect(s2.data).toBe(theirs)
    expect(s2.past).toEqual([])
    expect(s2.future).toEqual([])
  })

  it('keeps the same state when the adopted document is the current one', () => {
    const doc = makeDoc('V1')
    const s0: HistoryState = { data: doc, past: [], future: [] }
    expect(historyReducer(s0, { type: 'adopt', next: doc })).toBe(s0)
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

interface Harness {
  commit: (next: BentoDoc | ((prev: BentoDoc) => BentoDoc)) => void
  data: BentoDoc
}

/**
 * The hook, plus the commit handler of the FIRST render — the one a deferred caller would
 * still be holding, which is the whole point of asking the question here.
 */
function renderHistory(): { staleCommit: Harness['commit']; read: () => BentoDoc } {
  // The host hands the committed document back in as `initialData` (registry.ts does the
  // same), which is what tells the hook the change came from this surface.
  const host: { doc: BentoDoc } = { doc: makeDoc('Start') }
  const renders: Harness[] = []
  function Probe() {
    const { data, commitData } = useSlidesHistory(host.doc, (next) => {
      host.doc = next
    })
    renders.push({ commit: commitData, data })
    return null
  }
  renderElement(createElement(Probe))
  const first = renders[0]
  if (!first) throw new Error('the history hook did not render')
  return {
    staleCommit: first.commit,
    read: () => {
      const last = renders[renders.length - 1]
      if (!last) throw new Error('the history hook did not render')
      return last.data
    },
  }
}

describe('useSlidesHistory commit handler', () => {
  it('resolves a change from the latest document, not from the render it came from', () => {
    const { staleCommit, read } = renderHistory()

    act(() => staleCommit((prev) => ({ ...prev, title: 'typed' })))
    act(() => staleCommit((prev) => ({ ...prev, title: `${prev.title}+pasted` })))

    expect(read().title).toBe('typed+pasted')
  })
})

let unmountHistory: (() => void) | null = null

afterEach(() => {
  unmountHistory?.()
  unmountHistory = null
})

/**
 * The history's own window listener, which is the only path ⌘Z takes: the editing hook
deliberately leaves the key to the browser so this one owns it. The listener is shared with
the host, so a probe that types into a field is how the guard against swallowing keystrokes
gets checked at all.
 */
function mountHistoryKeys(): { host: { doc: BentoDoc }; commit: () => void } {
  const host: { doc: BentoDoc } = { doc: makeDoc('Start') }
  const commits: Array<(next: BentoDoc | ((prev: BentoDoc) => BentoDoc)) => void> = []
  function Probe() {
    const { commitData } = useSlidesHistory(host.doc, (next) => {
      host.doc = next
    })
    commits.push(commitData)
    return null
  }
  const rendered = renderElement(createElement(Probe))
  unmountHistory = rendered.unmount
  return {
    host,
    commit: () => {
      const first = commits[0]
      if (!first) throw new Error('the history hook did not render')
      act(() => first((prev) => ({ ...prev, title: 'Edited' })))
    },
  }
}

function pressKey(key: string, options: KeyboardEventInit = {}, target?: EventTarget): boolean {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...options })
  act(() => {
    ;(target ?? window).dispatchEvent(event)
  })
  return event.defaultPrevented
}

describe('the history keyboard', () => {
  it('undoes on the modifier key and redoes on the shifted one', () => {
    const { host, commit } = mountHistoryKeys()
    commit()
    expect(host.doc.title).toBe('Edited')

    expect(pressKey('z', { ctrlKey: true })).toBe(true)
    expect(host.doc.title).toBe('Start')

    expect(pressKey('z', { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(host.doc.title).toBe('Edited')
  })

  it('does nothing for a plain key, which belongs to nobody here', () => {
    const { host, commit } = mountHistoryKeys()
    commit()
    expect(pressKey('z')).toBe(false)
    expect(host.doc.title).toBe('Edited')
  })

  it('leaves the keys to a form field while the reader is typing in one', () => {
    const { host, commit } = mountHistoryKeys()
    commit()
    const field = document.createElement('input')
    document.body.appendChild(field)

    expect(pressKey('z', { ctrlKey: true }, field)).toBe(false)
    expect(host.doc.title).toBe('Edited')
    field.remove()
  })
})
