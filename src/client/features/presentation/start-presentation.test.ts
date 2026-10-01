/**
 * Putting a note on the projector is one path now shared by the workspace button, the command
 * palette and the global shortcut, so what is pinned here is what that one path promises: the deck
 * is the note's own body under the note's own title, and the slide it opens on is the one the
 * editor cursor happens to sit on.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { setActiveEditorView } from '../../editor/commands'
import { noteSummary } from '../../store/notes-test-utils'
import { useNotes } from '../../store/notes'
import { usePresentation } from '../../store/presentation'
import { startPresentationFromNote } from './start-presentation'

const IDLE = { open: false, noteId: null, title: '', snapshot: '', following: true, initialSlideIndex: 0 }
const THREE_SLIDES = '# First\n\n---\n\n# Second\n\n---\n\n# Third'

function putNote(id: string, content: string, title = 'Quarterly talk') {
  useNotes.setState({ notes: { [id]: noteSummary(id, { title }) }, contents: { [id]: content } })
}

function cursorAt(head: number) {
  setActiveEditorView({ state: { selection: { main: { head } } } } as unknown as EditorView)
}

beforeEach(() => {
  usePresentation.setState(IDLE)
})

afterEach(() => {
  setActiveEditorView(null)
  useNotes.setState({ notes: {}, contents: {} })
})

describe('startPresentationFromNote', () => {
  it('opens the show on the note\'s own body and title', () => {
    putNote('note-1', THREE_SLIDES)
    cursorAt(0)

    expect(startPresentationFromNote('note-1')).toBe(true)
    expect(usePresentation.getState()).toMatchObject({
      open: true,
      noteId: 'note-1',
      title: 'Quarterly talk',
      snapshot: THREE_SLIDES,
      following: true,
      initialSlideIndex: 0,
    })
  })

  it('opens on the slide the editor cursor sits on, not on the first', () => {
    putNote('note-1', THREE_SLIDES)
    cursorAt(THREE_SLIDES.indexOf('# Third'))

    startPresentationFromNote('note-1')
    expect(usePresentation.getState().initialSlideIndex).toBe(2)
  })

  it('starts from the top when no editor is on screen to place a cursor', () => {
    putNote('note-1', THREE_SLIDES)

    startPresentationFromNote('note-1')
    expect(usePresentation.getState().initialSlideIndex).toBe(0)
  })

  it('starts empty but following when the body has not loaded yet', () => {
    // The overlay reads the live note while following, so a deck that begins before the body
    // arrives fills itself in; the show opening at all is what this pins.
    useNotes.setState({ notes: { 'note-1': noteSummary('note-1', { title: 'Slow note' }) }, contents: {} })

    startPresentationFromNote('note-1')
    expect(usePresentation.getState()).toMatchObject({ open: true, snapshot: '', following: true })
  })

  it('leaves the show closed when the note is gone', () => {
    useNotes.setState({ notes: {}, contents: {} })

    expect(startPresentationFromNote('note-gone')).toBe(false)
    expect(usePresentation.getState()).toMatchObject(IDLE)
  })
})
