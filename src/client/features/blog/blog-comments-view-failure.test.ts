import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { useBlogStore } from './blog-store'
import { BlogCommentsView } from './blog-comments-view'

vi.mock('../../lib/api', () => ({
  api: { blog: { comments: { list: vi.fn() } } },
}))

const list = api.blog.comments.list as unknown as ReturnType<typeof vi.fn>

let rendered: RenderedElement | null = null
let logged: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  list.mockReset()
  useBlogStore.setState({ comments: [], loadErrors: new Set() })
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
  logged.mockRestore()
})

function retryButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === t('common.retry'))
  if (!button) throw new Error('the failure state rendered no retry control')
  return button as HTMLButtonElement
}

/**
 * ENG-01: a failed load is a state of its own. This surface used to draw `filteredComments` and, when
 * it was empty because nothing had arrived, say there were no comments — so being offline looked
 * exactly like a blog nobody had commented on.
 */
describe('blog comments view draws a failed load as a failure', () => {
  it('offers a retry instead of saying there are no comments, and recovers on one', async () => {
    list.mockRejectedValueOnce(new Error('offline'))

    rendered = renderElement(createElement(BlogCommentsView))
    await act(async () => { await useBlogStore.getState().loadComments() })

    expect(document.body.textContent).toContain(t('blog.load_failed'))
    expect(document.body.textContent).not.toContain(t('blog.no_comments'))

    list.mockResolvedValueOnce({ comments: [] })
    await act(async () => { retryButton().click() })

    expect(document.body.textContent).toContain(t('blog.no_comments'))
    expect(document.body.textContent).not.toContain(t('blog.load_failed'))
  })

  it('keeps showing comments that are already there when a refresh fails', async () => {
    list.mockResolvedValueOnce({
      comments: [{
        id: 'c-1', postId: 'p-1', postTitle: 'Hello', postSlug: 'hello', parentId: null,
        authorName: 'Reader', authorEmail: 'reader@example.com', content: 'Nice post',
        status: 'approved', createdAt: 0, updatedAt: 0,
      }],
    })
    await useBlogStore.getState().loadComments()

    list.mockRejectedValueOnce(new Error('offline'))
    rendered = renderElement(createElement(BlogCommentsView))
    await act(async () => { await useBlogStore.getState().loadComments() })

    expect(document.body.textContent).toContain('Nice post')
    expect(document.body.textContent).not.toContain(t('blog.load_failed'))
  })
})
