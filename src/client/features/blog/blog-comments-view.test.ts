import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogComment } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { useBlogStore } from './blog-store'
import { BlogCommentsView } from './blog-comments-view'
import { useUi } from '../../store/ui'

// UI-08: the card's status buttons were wired straight to the store and could be clicked again while
// the first write was in flight; a change that landed said nothing.

const deferred = vi.hoisted(() => {
  let settle: (value: unknown) => void = () => {}
  const updateStatus = vi.fn(() => new Promise((resolve) => { settle = resolve }))
  return {
    updateStatus,
    listComments: vi.fn(async () => ({ comments: [COMMENT_FIXTURE()], counts: COUNTS })),
    stats: vi.fn(async () => ({ stats: null })),
    settle: (value: unknown) => settle(value),
  }
})

function COMMENT_FIXTURE(): BlogComment {
  return {
    id: 'comment-1',
    postId: 'post-1',
    postTitle: 'Hello World',
    postSlug: 'hello-world',
    parentId: null,
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    content: 'Nice post',
    status: 'pending',
    createdAt: 1_700_000_000_000,
  }
}

const COUNTS = { all: 1, pending: 1, approved: 0, rejected: 0, spam: 0 }

vi.mock('../../lib/api', () => ({
  api: {
    blog: {
      comments: { updateStatus: deferred.updateStatus, list: deferred.listComments },
      stats: deferred.stats,
    },
  },
}))

let rendered: RenderedElement | null = null

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
  useBlogStore.setState({
    comments: [COMMENT_FIXTURE()],
    commentStats: COUNTS,
    commentStatusFilter: 'all',
    commentSearch: '',
    settings: null,
  })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function buttonByText(name: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((el) => el.textContent?.trim() === name)
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

describe('comment moderation feedback', () => {
  it('disables that comment while its change is in flight and reports it once it lands', async () => {
    rendered = renderElement(createElement(BlogCommentsView))

    const approve = buttonByText(t('blog.approve'))
    await act(async () => { approve.click() })

    expect(deferred.updateStatus).toHaveBeenCalledWith('comment-1', 'approved')
    expect(approve.disabled, 'the status buttons stayed live while the write was in flight').toBe(true)

    await act(async () => {
      deferred.settle({ ok: true })
      await Promise.resolve()
    })
    expect(useUi.getState().toasts.map((toast) => toast.title)).toContain(t('blog.comment_status_updated'))
    expect(buttonByText(t('blog.approve')).disabled).toBe(false)
  })
})
