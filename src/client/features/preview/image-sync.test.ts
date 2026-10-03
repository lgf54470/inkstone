import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotes } from '../../store/notes'
import { writeImageAttrs } from './image-sync'

const REF = { line: 0, index: 0, src: 'a.png' }

function seedContent(content: string) {
  const editContent = vi.fn()
  useNotes.setState({ contents: { 'note-image': content }, editContent })
  return editContent
}

beforeEach(() => {
  useNotes.setState({ contents: {}, editContent: vi.fn() })
})

describe('image write-back through the note store', () => {
  it('hands the whole new text to the store exactly once, so one undo takes the change back', () => {
    const editContent = seedContent('![cat](a.png)')
    expect(writeImageAttrs('note-image', REF, (attrs) => ({ ...attrs, widthPct: 50 }))).toBe('written')
    expect(editContent).toHaveBeenCalledTimes(1)
    expect(editContent).toHaveBeenCalledWith('note-image', '![cat](a.png){width=50%}')
  })

  it('writes nothing when the image is no longer where the rendered node said it was', () => {
    const editContent = seedContent('![cat](gone.png)')
    expect(writeImageAttrs('note-image', REF, (attrs) => ({ ...attrs, widthPct: 50 }))).toBe('conflict')
    expect(editContent).not.toHaveBeenCalled()
  })

  it('writes nothing when the attributes did not actually change', () => {
    const editContent = seedContent('![cat](a.png){width=50%}')
    expect(writeImageAttrs('note-image', REF, (attrs) => attrs)).toBe('written')
    expect(editContent).not.toHaveBeenCalled()
  })

  it('reports a missing note instead of guessing at one', () => {
    seedContent('![cat](a.png)')
    expect(writeImageAttrs(null, REF, (attrs) => ({ ...attrs, widthPct: 50 }))).toBe('missing')
    expect(writeImageAttrs('note-absent', REF, (attrs) => ({ ...attrs, widthPct: 50 }))).toBe('missing')
  })
})
