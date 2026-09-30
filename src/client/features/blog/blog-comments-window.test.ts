import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BlogComment, BlogCommentStatus } from '@shared/types'
import { t } from '../../lib/i18n'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { useBlogStore } from './blog-store'
import { BlogCommentsView } from './blog-comments-view'

function comment(index: number): BlogComment {
  return {
    id: `c-${index}`, postId: 'p-1', postTitle: 'Hello', postSlug: 'hello', parentId: null,
    authorName: `Reader ${index}`, authorEmail: `reader${index}@example.com`,
    content: `body-${index}`, status: 'approved' as BlogCommentStatus, createdAt: 0,
  }
}

let rendered: RenderedElement | null = null

beforeEach(() => {
  useBlogStore.setState({ comments: [], loadErrors: new Set() })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function rowCount(): number {
  return document.querySelectorAll('[data-comment-id]').length
}

function showMoreButton(): HTMLButtonElement {
  const label = t('blog.list_show_more', { value0: 100, value1: 250 })
  const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === label)
  if (!button) throw new Error('the windowed list rendered no show-more control')
  return button as HTMLButtonElement
}

/**
 * The moderation list accepts up to 500 rows from the server, and the view used to build and mount
 * every one of them before the reader had scrolled past the first screen.
 */
describe('comment list window', () => {
  it('mounts one page of rows and grows on demand', () => {
    useBlogStore.setState({ comments: Array.from({ length: 250 }, (_, i) => comment(i)) })
    rendered = renderElement(createElement(BlogCommentsView))

    expect(rowCount()).toBe(100)

    act(() => {
      showMoreButton().click()
    })
    expect(rowCount()).toBe(200)

    act(() => {
      showMoreButton().click()
    })
    expect(rowCount()).toBe(250)
    expect(document.body.textContent).not.toContain(t('blog.list_show_more', { value0: 250, value1: 250 }))
  })
})
