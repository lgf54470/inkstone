import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { completeCodeFenceOnEnter, insertAbbreviation, insertChartJs, insertDefinitionList, insertEmoji, insertMermaid, insertRuby, insertTableOfContents, insertTaskWithStatus, toggleSubscript, toggleSuperscript, toggleTaskDone, toggleUnderline } from './commands'

function runFenceCompletion(doc: string, cursor = doc.length) {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(cursor) })
  let next = state
  const handled = completeCodeFenceOnEnter({ state, dispatch: (transaction) => { next = transaction.state } })
  return { handled, state: next }
}

describe('completeCodeFenceOnEnter', () => {
  it('adds a closing fence and places the cursor inside a new code block', () => {
    const result = runFenceCompletion('```ts')

    expect(result.handled).toBe(true)
    expect(result.state.doc.toString()).toBe('```ts\n\n```')
    expect(result.state.selection.main.head).toBe(6)
  })

  it('does not add another fence when Enter is pressed on a closing fence', () => {
    const result = runFenceCompletion('```\nconsole.log(1)\n```')

    expect(result.handled).toBe(false)
    expect(result.state.doc.toString()).toBe('```\nconsole.log(1)\n```')
  })
})

describe('insertDiagramCode', () => {
  it('inserts mermaid diagram block', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertMermaid({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('```mermaid\nflowchart TD')
  })

  it('inserts chart block', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertChartJs({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('```chart\n{\n  "type": "bar"')
  })
})

describe('toggleSubscript and toggleSuperscript', () => {
  it('wraps and unwraps subscript', () => {
    const state = EditorState.create({ doc: 'H2O', selection: EditorSelection.range(1, 2) })
    let next = state
    toggleSubscript({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('H~2~O')
  })

  it('wraps and unwraps superscript', () => {
    const state = EditorState.create({ doc: 'X2', selection: EditorSelection.range(1, 2) })
    let next = state
    toggleSuperscript({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('X^2^')
  })

  it('wraps and unwraps underline', () => {
    const state = EditorState.create({ doc: 'Important text', selection: EditorSelection.range(0, 9) })
    let next = state
    toggleUnderline({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('++Important++ text')
  })

  it('inserts table of contents block', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertTableOfContents({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('[TOC]\n\n')
  })

  it('toggles extended task marker to done', () => {
    const state = EditorState.create({ doc: '- [/] In progress task', selection: EditorSelection.cursor(5) })
    let next = state
    toggleTaskDone({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('- [x] In progress task')
  })

  it('inserts ruby annotation template', () => {
    const state = EditorState.create({ doc: 'word', selection: EditorSelection.range(0, 4) })
    let next = state
    insertRuby({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('{word|')
  })

  it('inserts definition list template', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertDefinitionList({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('\n: ')
  })

  it('inserts abbreviation template', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertAbbreviation({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('*[HTML]: ')
  })

  it('inserts emoji and task with status marker', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertTaskWithStatus('/')({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('- [/] ')

    insertEmoji('🎉')({ state: next, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toBe('- [/] 🎉')
  })
})

