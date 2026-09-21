import { act, createElement, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderElement } from '../lib/test-render'
import { useNotes } from '../store/notes'
import { useUi } from '../store/ui'
import { TagFilterPopover } from './tag-filter-popover'

/**
 * The picker is one of the two popovers that used to size and place itself: both now share
 * `popover-placement`, and this is the first test the file has had. What it pins is the part the
 * placement decides — the panel is portaled (so `fixed` stays on the viewport), it is a named
 * dialog, and its box is clamped inside the page instead of starting at a negative coordinate when
 * its control sits against the left edge. jsdom reports every box as 0×0, which is exactly that
 * case.
 */
const PANEL = '[role="dialog"][aria-label="command.filter_by_tags"]'

const mounts: Array<{ unmount: () => void }> = []

/** The popover hangs from a real control, which is what its placement measures. */
function Harness() {
  const anchor = useRef<HTMLButtonElement>(null)
  return createElement('div', null,
    createElement('button', { ref: anchor }, 'tags'),
    createElement(TagFilterPopover, { anchor, open: true, onClose: () => {} }),
  )
}

function mount() {
  const rendered = renderElement(createElement(Harness))
  mounts.push(rendered)
  return rendered
}

function panel(): HTMLElement | null {
  return document.body.querySelector(PANEL)
}

beforeEach(() => {
  useNotes.setState({ tags: [] })
  useUi.setState({ selectedTags: [], selectedTagsMatch: 'any' })
})

afterEach(() => {
  while (mounts.length) mounts.pop()!.unmount()
})

describe('tag filter popover placement (SH-50)', () => {
  it('renders a named dialog on the document rather than in its own subtree', () => {
    const rendered = mount()
    expect(panel()).not.toBeNull()
    expect(rendered.container.querySelector(PANEL)).toBeNull()
  })

  it('keeps the panel inside the page when its control is against the left edge', () => {
    mount()
    const style = panel()!.style
    expect(Number.parseFloat(style.left)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(style.top)).toBeGreaterThan(0)
    expect(style.transformOrigin).toBe('top right')
  })

  it('moves the focus into its search field', async () => {
    mount()
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
    })
    expect(document.activeElement).toBe(panel()!.querySelector('input'))
  })
})
