import { describe, expect, it } from 'vitest'
import { presentedNoteContent, railOpenFor } from './presentation-state'

describe('presentedNoteContent — following', () => {
  it('presents the live note while following', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '# Opening\n\nRevised', noteExists: true })).toBe('# Opening\n\nRevised')
  })

  it('keeps the snapshot until the note body has loaded', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: undefined, noteExists: true })).toBe('# Opening')
  })

  it('falls back to the snapshot when the note is gone instead of blanking the projector', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '', noteExists: false })).toBe('# Opening')
  })

  it('still presents an empty note that exists, so clearing the script clears the slides', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '', noteExists: true })).toBe('')
  })

  it('ignores live edits once frozen', () => {
    expect(presentedNoteContent({ following: false, snapshot: '# Frozen', live: '# Revised', noteExists: true })).toBe('# Frozen')
  })
})

describe('railOpenFor', () => {
  it('follows the viewport until the presenter chooses', () => {
    expect(railOpenFor(null, true)).toBe(true)
    expect(railOpenFor(null, false)).toBe(false)
  })

  it('lets an explicit choice outlive a viewport change', () => {
    expect(railOpenFor(true, false)).toBe(true)
    expect(railOpenFor(false, true)).toBe(false)
  })
})
