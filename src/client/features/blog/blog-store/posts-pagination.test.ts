import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: { blog: { posts: { list: vi.fn() } } },
}))

const list = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>

function summary(id: string) {
  return {
    id, slug: id, noteId: `n-${id}`, userId: 'u', title: id, excerpt: '',
    coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true,
    allowComments: true, isPinned: false, views: 0, commentsCount: 0,
    publishedAt: 0, createdAt: 0, updatedAt: 0,
  }
}

function pageOf(ids: string[], page: number, total: number, totalPages = Math.max(1, Math.ceil(total / 50))) {
  return { posts: ids.map(summary), pagination: { page, limit: 50, total, totalPages } }
}

beforeEach(() => {
  list.mockReset()
  useBlogStore.setState({ posts: [], postsPage: 1, postsTotal: 0, postsTotalPages: 0, loadErrors: new Set() })
})

/**
 * ENG-02: the list is one page now. The page is part of the query, so it belongs to the store —
 * every place that changes a filter has to ask for page one again, and the pager may only ask for a
 * page the server said exists.
 */
describe('blog post pagination', () => {
  it('asks for the page the store is on and records what the server said about the list', async () => {
    list.mockResolvedValueOnce(pageOf(['a', 'b'], 1, 3, 2))
    await useBlogStore.getState().loadPosts()

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), expect.anything())
    expect(useBlogStore.getState().postsTotal).toBe(3)
    expect(useBlogStore.getState().postsTotalPages).toBe(2)
  })

  it('clamps a requested page to the pages that exist and asks only when the page changes', async () => {
    useBlogStore.setState({ postsPage: 1, postsTotal: 2, postsTotalPages: 2 })
    list.mockResolvedValue(pageOf(['b'], 2, 2, 2))

    useBlogStore.getState().setPostsPage(5)
    expect(useBlogStore.getState().postsPage).toBe(2)
    await vi.waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), expect.anything()))

    const calls = list.mock.calls.length
    useBlogStore.getState().setPostsPage(2)
    expect(list.mock.calls.length).toBe(calls)
  })

  it('returns to page one when a filter changes, so a narrowed list starts where its rows are', async () => {
    useBlogStore.setState({ postsPage: 3, postsTotalPages: 5, postsTotal: 200 })
    list.mockResolvedValue(pageOf([], 1, 0))

    useBlogStore.getState().setSearch('needle')

    expect(useBlogStore.getState().postsPage).toBe(1)
    await vi.waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, search: 'needle' }), expect.anything()),
    )
  })

  it('re-asks the last page that exists when an empty page answers because a delete emptied it', async () => {
    useBlogStore.setState({ postsPage: 3, postsTotalPages: 3, postsTotal: 1, posts: [summary('kept')] })
    list
      .mockResolvedValueOnce(pageOf([], 3, 1))
      .mockResolvedValueOnce(pageOf(['kept'], 1, 1))

    await useBlogStore.getState().loadPosts()

    expect(useBlogStore.getState().postsPage).toBe(1)
    await vi.waitFor(() => expect(useBlogStore.getState().posts.map((p) => p.id)).toEqual(['kept']))
  })
})
