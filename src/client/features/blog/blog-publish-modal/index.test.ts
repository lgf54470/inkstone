import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useNotes } from '../../../store/notes'
import { BlogPublishModal } from './index'

// The dialog loads categories and asks about the slug when it opens; neither is what this test is
// about, and both would otherwise reach for a server that is not there.
vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      categories: { list: vi.fn().mockResolvedValue({ categories: [] }) },
      checkSlug: vi.fn().mockResolvedValue({ available: true }),
    },
  },
}))

let rendered: RenderedElement | null = null
let logged: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // A content already in memory keeps `peekContent` out of the picture.
  useNotes.setState({ contents: { 'note-wiring': '# Body' } })
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
  logged.mockRestore()
})

/**
 * UI-04: every visible label is associated with the control it names — the modal used to draw bare
 * `<label>`s the browser could not connect to anything, and the slug's error was a sibling sentence
 * no screen reader would read out with the field.
 */
describe('blog publish modal field wiring', () => {
  it('points every label at the control it names', () => {
    rendered = renderElement(createElement(BlogPublishModal, {
      open: true,
      onClose: vi.fn(),
      noteId: 'note-wiring',
    }))

    const labels = [...document.body.querySelectorAll('label')]
    expect(labels.length).toBeGreaterThanOrEqual(6)
    for (const label of labels) {
      const target = label.getAttribute('for')
      expect(target, `label ${label.textContent}`).toBeTruthy()
      const control = document.getElementById(target!)
      expect(control, `control for ${label.textContent}`).toBeTruthy()
      expect(control!.getAttribute('aria-labelledby'), `name for ${label.textContent}`).toBeTruthy()
    }
  })
})
