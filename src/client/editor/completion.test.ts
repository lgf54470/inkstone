import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { TransactionSpec } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { tagSource, wikiLinkSource } from './completion'

const NOTE_TITLE = 'Inkstone demo guide'
const NOTES = [
  { id: '1', title: NOTE_TITLE, excerpt: 'demo mode' },
  { id: '2', title: 'AGENTS.md handbook', excerpt: 'general rules' },
]

function makeWikiLinkSource() {
  return wikiLinkSource(() => ({ notes: () => NOTES, tags: () => [] }))
}

function makeView(state: EditorState): { view: EditorView; states: EditorState[] } {
  const states: EditorState[] = []
  const view = {
    state,
    dispatch: (spec: TransactionSpec) => { states.push(state.update(spec).state) },
  } as unknown as EditorView
  return { view, states }
}

function applyOption(state: EditorState, label: string, from: number, to: number): EditorState | undefined {
  const context = new CompletionContext(state, to, true)
  const result = makeWikiLinkSource()(context)
  const option = result?.options.find((o) => o.label === label)
  expect(option).toBeDefined()
  const { view, states } = makeView(state)
  ;(option!.apply as (v: EditorView, c: unknown, from: number, to: number) => void)(view, option, from, to)
  return states[0]
}

describe('wikiLinkSource', () => {
  it('suggests notes for an empty query right after [[', () => {
    const state = EditorState.create({ doc: '[[]]' })
    const result = makeWikiLinkSource()(new CompletionContext(state, 2, true))
    expect(result).not.toBeNull()
    expect(result?.options.map((o) => o.label)).toContain(NOTE_TITLE)
  })

  it('offers to create a new note when the query matches nothing', () => {
    const doc = '[[brand-new-topic'
    const state = EditorState.create({ doc })
    const result = makeWikiLinkSource()(new CompletionContext(state, doc.length, true))
    expect(result?.options.some((o) => o.label === 'brand-new-topic')).toBe(true)
  })
})

describe('wikiLink completion apply', () => {
  it('reuses the closing brackets already written by the toolbar wrap command', () => {
    const state = EditorState.create({ doc: '[[]]' })
    const next = applyOption(state, NOTE_TITLE, 2, 2)
    expect(next?.doc.toString()).toBe(`[[${NOTE_TITLE}]]`)
    expect(next?.selection.main.head).toBe('[['.length + NOTE_TITLE.length + 2)
  })

  it('appends closing brackets when the document has none', () => {
    const state = EditorState.create({ doc: '[[Ink' })
    const next = applyOption(state, NOTE_TITLE, 2, 5)
    expect(next?.doc.toString()).toBe(`[[${NOTE_TITLE}]]`)
  })

  it('reuses closing brackets for the create-new-note option', () => {
    const state = EditorState.create({ doc: '[[draft' })
    const next = applyOption(state, 'draft', 2, 7)
    expect(next?.doc.toString()).toBe('[[draft]]')
  })
})

describe('tagSource', () => {
  it('returns tag completion options and prioritizes pinned tags', () => {
    const state = EditorState.create({ doc: 'Hello #wo' })
    const context = new CompletionContext(state, 9, true)
    const source = tagSource(() => ({
      notes: () => [],
      tags: () => [
        { name: 'work/backend', count: 2, isPinned: false },
        { name: 'work/frontend', count: 1, isPinned: true },
      ],
    }))

    const result = source(context)
    expect(result).not.toBeNull()
    expect(result?.options).toHaveLength(2)
    const pinned = result!.options.find((o) => o.label === 'work/frontend')
    const unpinned = result!.options.find((o) => o.label === 'work/backend')
    expect(pinned?.detail).toContain('📌')
    expect((pinned?.boost ?? 0) > (unpinned?.boost ?? 0)).toBe(true)
  })
})
