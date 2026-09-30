import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useBlogStore } from './blog-store'
import { BlogHubToolbar } from './blog-hub-toolbar'

// The toolbar's two pickers used to be `<button>`s with no state a reader could query. They are
// radiogroups now, and this pins the names and the option names that make them more than visual.
// The locale is not loaded in this harness, so `t()` echoes the key.

// The sort select asks the store for a new order, and the store re-asks the list; the answer is not
// what this file is about, so the request is stubbed and read back.
const { listPosts } = vi.hoisted(() => ({ listPosts: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: { blog: { posts: { list: listPosts } } } }))

beforeEach(() => {
  listPosts.mockReset()
  listPosts.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })
  useBlogStore.setState({ sort: 'published_desc' })
})

function mountToolbar() {
  return renderElement(createElement(BlogHubToolbar, {
    onOpenSettings: vi.fn(),
    onOpenNewPost: vi.fn(),
  }))
}

describe('blog hub toolbar pickers', () => {
  it('names the status and view groups and names each icon-only view option', () => {
    const { container, unmount } = mountToolbar()

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

  // UI-06: `setSort` was wired and the server honoured three orders, but nothing in the UI could ask
  // for one. The select offers exactly those three values and hands the choice to the store.
  it('offers the three orders the list query understands and hands the choice to the store', async () => {
    const { container, unmount } = mountToolbar()
    try {
      const select = container.querySelector<HTMLSelectElement>('select[aria-label="blog.sort_label"]')
      expect(select, 'the toolbar offers no way to sort').not.toBeNull()
      expect([...select!.options].map((option) => option.value)).toEqual([
        'published_desc',
        'published_asc',
        'views_desc',
      ])
      expect(select!.value).toBe('published_desc')

      act(() => {
        select!.value = 'views_desc'
        select!.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await act(async () => {})

      expect(useBlogStore.getState().sort).toBe('views_desc')
      expect(listPosts).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'views_desc' }),
        expect.anything(),
      )
    } finally {
      unmount()
    }
  })
})
