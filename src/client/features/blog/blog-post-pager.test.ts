import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { useBlogStore } from './blog-store'
import { BlogPostPager } from './blog-post-pager'

vi.mock('../../lib/api', () => ({
  api: { blog: { posts: { list: vi.fn() } } },
}))

const list = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>

let rendered: RenderedElement | null = null

beforeEach(() => {
  list.mockReset()
  useBlogStore.setState({ postsPage: 2, postsTotal: 120, postsTotalPages: 3, loadErrors: new Set() })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function button(name: string): HTMLButtonElement {
  const element = Array.from(document.querySelectorAll('button')).find((el) => el.textContent === name)
  if (!element) throw new Error(`the pager rendered no ${name} control`)
  return element as HTMLButtonElement
}

/**
 * ENG-02: the list used to hold every post; it now holds one page. Without a pager the rest of the
 * list would be unreachable in the interface — the store's page state exists, but nobody could move
 * it.
 */
describe('blog post pager', () => {
  it('is absent while the whole list fits one page', () => {
    useBlogStore.setState({ postsTotalPages: 1 })
    rendered = renderElement(createElement(BlogPostPager))
    expect(document.body.textContent).not.toContain(t('blog.posts_prev_page'))
    expect(document.body.textContent).not.toContain(t('blog.posts_next_page'))
  })

  it('shows the position and moves one page at a time with the ends disabled', async () => {
    list.mockResolvedValue({
      posts: [],
      pagination: { page: 3, limit: 50, total: 120, totalPages: 3 },
    })
    rendered = renderElement(createElement(BlogPostPager))

    expect(document.body.textContent).toContain(t('blog.posts_page_info', { page: 2, totalPages: 3, total: 120 }))
    expect(button(t('blog.posts_prev_page')).disabled).toBe(false)
    expect(button(t('blog.posts_next_page')).disabled).toBe(false)

    await act(async () => { button(t('blog.posts_next_page')).click() })

    expect(useBlogStore.getState().postsPage).toBe(3)
    expect(button(t('blog.posts_next_page')).disabled).toBe(true)
  })
})
