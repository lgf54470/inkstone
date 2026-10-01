import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogTrashEntry } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { fullTime } from '../../../lib/time'
import { installTestGlobals, renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { useBlogStore } from '../blog-store'
import { BlogTrashView as TrashView } from './index'

// FEA-04: the bin is where a delete goes, and the three ways out of it are decisions the reader
// makes — restore, erase one, empty the bin. The view has to say which of them is happening and what
// came of it, and a failed load must never read as "nothing was deleted".

const deferred = vi.hoisted(() => ({
  restore: vi.fn(async () => ({ ok: true as const })),
  purge: vi.fn(async () => ({ ok: true as const })),
  empty: vi.fn(async () => ({ purged: 1 })),
  list: vi.fn(async () => ({ posts: [] as BlogTrashEntry[] })),
  postsList: vi.fn(async () => ({ posts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })),
  postIndex: vi.fn(async () => ({ posts: [] })),
  stats: vi.fn(async () => ({ stats: null })),
  tags: vi.fn(async () => []),
  confirm: vi.fn(async () => true),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      trash: {
        list: deferred.list,
        restore: deferred.restore,
        purge: deferred.purge,
        empty: deferred.empty,
      },
      posts: { list: deferred.postsList },
      postIndex: deferred.postIndex,
      stats: deferred.stats,
      tags: { list: deferred.tags },
    },
  },
}))

vi.mock('../../../components/overlay', () => ({ confirm: deferred.confirm }))

const ENTRY: BlogTrashEntry = {
  id: 'post-1',
  slug: 'hello-world',
  noteId: 'note-1',
  userId: 'user-1',
  title: 'Hello World',
  excerpt: 'An excerpt',
  coverUrl: '',
  categoryId: null,
  folderId: null,
  tags: ['alpha'],
  isPublished: true,
  allowComments: true,
  isPinned: false,
  views: 3,
  commentsCount: 1,
  publishedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  seoTitle: '',
  seoDescription: '',
  seoImageUrl: '',
  seoCanonicalUrl: '',
  seoNoindex: false,
  deletedAt: 1_700_900_000_000,
}

let rendered: RenderedElement | null = null

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
  deferred.restore.mockClear()
  deferred.purge.mockClear()
  deferred.empty.mockClear()
  deferred.list.mockClear()
  deferred.confirm.mockClear()
  deferred.confirm.mockResolvedValue(true)
  useBlogStore.setState({
    trashPosts: [ENTRY],
    loadErrors: new Set(),
    loading: false,
    dataLoadedAt: {},
    posts: [],
    postIndex: [],
    stats: null,
    tags: [],
  })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function mount(): void {
  rendered = renderElement(createElement(TrashView))
}

function buttonByText(name: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find((el) => el.textContent?.trim() === name)
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

function toastTitles(): string[] {
  return useUi.getState().toasts.map((toast) => toast.title)
}

describe('blog recycle bin view', () => {
  it('draws what waits in the bin, including when it was deleted', () => {
    mount()

    expect(rendered!.container.textContent).toContain(ENTRY.title)
    expect(rendered!.container.textContent).toContain(t('blog.trash_deleted_at', { value0: fullTime(ENTRY.deletedAt) }))
    expect(rendered!.container.textContent).toContain(t('blog.published'))
    expect(buttonByText(t('blog.trash_restore'))).toBeDefined()
    expect(buttonByText(t('blog.trash_empty_action')).disabled).toBe(false)
  })

  it('says the bin is empty when it is', () => {
    useBlogStore.setState({ trashPosts: [], loadErrors: new Set() })
    mount()

    expect(rendered!.container.textContent).toContain(t('blog.trash_empty'))
    expect(buttonByText(t('blog.trash_empty_action')).disabled).toBe(true)
  })

  it('draws a failed load as a failure with a retry, never as an empty bin', async () => {
    useBlogStore.setState({ trashPosts: [], loadErrors: new Set(['trash']) })
    mount()

    expect(rendered!.container.textContent).toContain(t('blog.load_failed'))
    expect(rendered!.container.textContent).not.toContain(t('blog.trash_empty'))

    await act(async () => {
      buttonByText(t('common.retry')).click()
      await Promise.resolve()
    })
    expect(deferred.list).toHaveBeenCalled()
  })
})

describe('blog recycle bin actions', () => {
  it('restores a post and says so', async () => {
    mount()

    await act(async () => {
      buttonByText(t('blog.trash_restore')).click()
      await Promise.resolve()
    })

    expect(deferred.restore).toHaveBeenCalledWith('post-1')
    expect(toastTitles()).toContain(t('blog.trash_restored'))
  })

  it('empties the bin and reports how many posts went', async () => {
    mount()

    await act(async () => {
      buttonByText(t('blog.trash_empty_action')).click()
      await Promise.resolve()
    })

    expect(deferred.empty).toHaveBeenCalled()
    expect(toastTitles()).toContain(t('blog.trash_emptied'))
  })

  it('erases nothing when the confirmation is declined', async () => {
    deferred.confirm.mockResolvedValueOnce(false)
    mount()

    await act(async () => {
      buttonByText(t('blog.trash_empty_action')).click()
      await Promise.resolve()
    })

    expect(deferred.empty).not.toHaveBeenCalled()
    expect(toastTitles()).toEqual([])
  })
})

describe('blog recycle bin purge', () => {
  it('asks before erasing one post for good, and reports the erase', async () => {
    mount()

    const purge = document.body.querySelector(`button[aria-label^="${t('blog.trash_purge')}"]`)
    expect(purge, 'the row has no erase-for-good control').not.toBeNull()

    await act(async () => {
      ;(purge as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(deferred.confirm).toHaveBeenCalled()
    expect(deferred.purge).toHaveBeenCalledWith('post-1')
    expect(toastTitles()).toContain(t('blog.trash_purged'))
  })
})
