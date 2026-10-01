import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogPostSummary } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { installTestGlobals, renderElement, type RenderedElement } from '../../lib/test-render'
import { useUi } from '../../store/ui'
import { useBlogStore } from './blog-store'
import { BlogRevisionsModal } from './blog-revisions-modal'

/**
 * FEA-05: the history panel. It has to draw the versions it was given, refuse to pretend a failed
 * load was an empty history, and confirm a restore before the current content becomes one more
 * version.
 */

const deferred = vi.hoisted(() => ({
  list: vi.fn(),
  restore: vi.fn(),
  postsList: vi.fn(),
  postIndex: vi.fn(),
  stats: vi.fn(),
  tagsList: vi.fn(),
  confirm: vi.fn(async () => true),
}))

vi.mock('../../lib/api', () => ({
  api: {
    blog: {
      posts: { revisions: deferred.list, restoreRevision: deferred.restore, list: deferred.postsList },
      postIndex: deferred.postIndex,
      stats: deferred.stats,
      tags: { list: deferred.tagsList },
    },
  },
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/overlay')>()
  return { ...actual, confirm: deferred.confirm }
})

function post(): BlogPostSummary {
  return {
    id: 'p1', slug: 'post-one', noteId: 'n1', userId: 'u', title: 'Current title', excerpt: '',
    coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true, allowComments: true,
    isPinned: false, views: 0, commentsCount: 0, publishedAt: 1000, createdAt: 1000, updatedAt: 1000,
    seoTitle: '', seoDescription: '', seoImageUrl: '', seoCanonicalUrl: '', seoNoindex: false,
  }
}

let rendered: RenderedElement | null = null

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
  useBlogStore.setState({
    revisions: null, revisionsPostId: null, revisionsFailed: false, revisionsRequestSeq: 0,
    posts: [], postIndex: [], stats: null, tags: [],
  })
  for (const mock of [deferred.list, deferred.restore, deferred.postsList, deferred.postIndex, deferred.stats, deferred.tagsList]) {
    mock.mockReset()
  }
  deferred.confirm.mockClear()
  deferred.confirm.mockResolvedValue(true)
  deferred.postsList.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } })
  deferred.postIndex.mockResolvedValue({ posts: [] })
  deferred.stats.mockResolvedValue({ stats: null })
  deferred.tagsList.mockResolvedValue([])
  deferred.restore.mockResolvedValue({ ok: true })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function mount(): void {
  rendered = renderElement(createElement(BlogRevisionsModal, { post: post(), onClose: vi.fn() }))
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function buttonByText(name: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === name || el.textContent?.trim() === name)
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

describe('blog revisions panel: restore', () => {
  it('lists the versions and restores only after the confirmation', async () => {
    deferred.list.mockResolvedValue({
      revisions: [{ id: 'r1', postId: 'p1', title: 'First title', size: 10, createdAt: 1_700_000_000_000 }],
    })
    mount()
    await flush()

    expect(document.body.textContent).toContain('First title')

    await act(async () => {
      buttonByText(t('blog.revisions_restore')).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deferred.confirm).toHaveBeenCalledTimes(1)
    expect(deferred.restore).toHaveBeenCalledWith('p1', 'r1')
    expect(useUi.getState().toasts.map((toast) => toast.title)).toContain(t('blog.revisions_restored'))
  })

  it('does not restore when the confirmation is declined', async () => {
    deferred.confirm.mockResolvedValue(false)
    deferred.list.mockResolvedValue({
      revisions: [{ id: 'r1', postId: 'p1', title: 'First title', size: 10, createdAt: 1_700_000_000_000 }],
    })
    mount()
    await flush()

    await act(async () => {
      buttonByText(t('blog.revisions_restore')).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deferred.restore).not.toHaveBeenCalled()
  })
})

describe('blog revisions panel: states', () => {
  it('draws a failed load as a failure with a retry, never as an empty history', async () => {
    deferred.list.mockRejectedValueOnce(new Error('offline'))
    mount()
    await flush()

    expect(document.body.textContent).toContain(t('blog.load_failed'))
    expect(document.body.textContent).not.toContain(t('blog.revisions_empty'))

    deferred.list.mockResolvedValue({
      revisions: [{ id: 'r1', postId: 'p1', title: 'First title', size: 10, createdAt: 1_700_000_000_000 }],
    })
    await act(async () => {
      buttonByText(t('common.retry')).click()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('First title')
    expect(document.body.textContent).not.toContain(t('blog.load_failed'))
  })

  it('says so when there is no earlier version', async () => {
    deferred.list.mockResolvedValue({ revisions: [] })
    mount()
    await flush()

    expect(document.body.textContent).toContain(t('blog.revisions_empty'))
  })
})
