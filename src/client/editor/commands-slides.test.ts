import { EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import {
  generateSlidesFromOutline,
  insertSlides,
  insertSlidesFromOutline,
} from './commands/slides'

describe('slides editor commands', () => {
  it('inserts default slides template', () => {
    const state = EditorState.create({ doc: '', selection: EditorSelection.cursor(0) })
    let next = state
    insertSlides({ state, dispatch: (tr) => { next = tr.state } })
    expect(next.doc.toString()).toContain('```bento-slides')
    expect(next.doc.toString()).toContain('bento/slides')
    expect(next.doc.toString()).toContain('Bento Slides Showcase')
  })

  it('inserts slides from outline when document has headings', () => {
    const doc = '# Topic 1\n- Detail A\n- Detail B\n# Topic 2\n- Detail C'
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(0) })
    let next = state
    const res = insertSlidesFromOutline({ state, dispatch: (tr) => { next = tr.state } })
    expect(res).toBe(true)
    expect(next.doc.toString()).toContain('```bento-slides')
    expect(next.doc.toString()).toContain('# Topic 1')
  })

  it('generates slides from selected outline text', () => {
    const doc = 'Intro\n# Selected Heading\n- Item 1\nOutro'
    const from = 6
    const to = 33
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) })
    let next = state
    const view = {
      state,
      dispatch: (tr: { state: EditorState }) => { next = tr.state },
    } as unknown as EditorView
    const res = generateSlidesFromOutline(view)
    expect(res).toBe(true)
    expect(next.doc.toString()).toContain('```bento-slides\n# Selected Heading\n- Item 1\n```')
  })
})
