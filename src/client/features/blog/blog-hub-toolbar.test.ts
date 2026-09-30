import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { BlogHubToolbar } from './blog-hub-toolbar'

/**
 * The toolbar's two pickers used to be `<button>`s with no state a reader could query. They are
 * radiogroups now, and this pins the names and the option names that make them more than visual.
 * The locale is not loaded in this harness, so `t()` echoes the key.
 */
describe('blog hub toolbar pickers', () => {
  it('names the status and view groups and names each icon-only view option', () => {
    const { container, unmount } = renderElement(createElement(BlogHubToolbar, {
      onOpenSettings: vi.fn(),
      onOpenNewPost: vi.fn(),
    }))

    const groups = [...container.querySelectorAll('[role="radiogroup"]')]
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'blog.status_filter_label',
      'blog.view_mode_label',
    ])

    const viewOptions = [...groups[1]!.querySelectorAll('[role="radio"]')]
    expect(viewOptions.map((option) => option.getAttribute('aria-label'))).toEqual([
      'blog.view_table',
      'blog.view_grid',
    ])
    expect(viewOptions.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    unmount()
  })
})
