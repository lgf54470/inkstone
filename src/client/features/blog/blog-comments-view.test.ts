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
    reply: vi.fn(async () => ({ ok: true as const, id: 'reply-1' })),
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
      comments: { updateStatus: deferred.updateStatus, reply: deferred.reply, list: deferred.listComments },
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
  deferred.reply.mockClear()
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

// FEA-06: the author answers an approved reader comment from the list, and the answer is sent as the
// comment it is answering — while a failed send keeps the draft where it was typed.
describe('author reply', () => {
  beforeEach(() => {
    useBlogStore.setState({
      comments: [{ ...COMMENT_FIXTURE(), status: 'approved' }],
      commentStats: { all: 1, pending: 0, approved: 1, rejected: 0, spam: 0 },
    })
  })

  it('opens the composer on the comment and sends it under that comment', async () => {
    rendered = renderElement(createElement(BlogCommentsView))

    await act(async () => {
      buttonByText(t('blog.comment_reply')).click()
    })

    const box = document.body.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t('blog.comment_reply_placeholder')}"]`)
    expect(box, 'the reply control opened no composer').not.toBeNull()

    await act(async () => {
      setTextareaValue(box!, 'Thanks for reading')
    })
    await act(async () => {
      buttonByText(t('blog.comment_reply_send')).click()
      await Promise.resolve()
    })

    expect(deferred.reply).toHaveBeenCalledWith('comment-1', 'Thanks for reading')
    expect(useUi.getState().toasts.map((toast) => toast.title)).toContain(t('blog.comment_reply_sent'))
  })

  it('keeps the draft open when the send is rejected', async () => {
    deferred.reply.mockRejectedValueOnce(new Error('offline'))
    rendered = renderElement(createElement(BlogCommentsView))

    await act(async () => {
      buttonByText(t('blog.comment_reply')).click()
    })
    const box = document.body.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t('blog.comment_reply_placeholder')}"]`)
    await act(async () => {
      setTextareaValue(box!, 'half written')
    })
    await act(async () => {
      buttonByText(t('blog.comment_reply_send')).click()
      await Promise.resolve()
    })

    expect(box!.value).toBe('half written')
    expect(useUi.getState().toasts.map((toast) => toast.title)).not.toContain(t('blog.comment_reply_sent'))
  })
})

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}
