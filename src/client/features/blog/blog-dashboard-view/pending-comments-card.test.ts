import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogComment } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { PendingCommentsCard } from './pending-comments-card'

// UI-08: the card's two buttons were fire-and-forget. A reader could click either one repeatedly
// while the first write was still in flight, and a change that landed said nothing.

const COMMENT: BlogComment = {
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

let rendered: RenderedElement | null = null

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
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

function renderCard(updateCommentStatus: (id: string, status: BlogComment['status']) => Promise<boolean>) {
  rendered = renderElement(createElement(PendingCommentsCard, {
    pendingComments: [COMMENT],
    totalComments: 1,
    totalPosts: 1,
    onSwitchTab: vi.fn(),
    updateCommentStatus,
  }))
}

describe('pending comments card feedback', () => {
  it('stops accepting a second click while the change is in flight, and announces it once it lands', async () => {
    let settle: (value: boolean) => void = () => {}
    const update = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => { settle = resolve }))
    renderCard(update)

    const approve = buttonByText(t('blog.approve'))
    const reject = buttonByText(t('blog.reject'))
    await act(async () => { approve.click() })

    expect(update).toHaveBeenCalledWith('comment-1', 'approved')
    expect(approve.disabled, 'the row accepted another click while the write was in flight').toBe(true)
    expect(reject.disabled).toBe(true)
    expect(approve.getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      settle(true)
      await Promise.resolve()
    })
    expect(useUi.getState().toasts.map((toast) => toast.title)).toContain(t('blog.comment_status_updated'))
    expect(approve.disabled).toBe(false)
  })

  it('does not claim success when the write failed', async () => {
    renderCard(vi.fn().mockResolvedValue(false))

    await act(async () => { buttonByText(t('blog.approve')).click() })

    expect(useUi.getState().toasts.map((toast) => toast.title)).not.toContain(t('blog.comment_status_updated'))
  })
})
