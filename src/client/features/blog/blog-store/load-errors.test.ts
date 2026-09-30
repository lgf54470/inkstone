import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      posts: { list: vi.fn() },
      comments: { list: vi.fn() },
      links: { list: vi.fn() },
    },
  },
}))

const postsList = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>
const commentsList = api.blog.comments.list as unknown as ReturnType<typeof vi.fn>
const linksList = api.blog.links.list as unknown as ReturnType<typeof vi.fn>

function post(id: string) {
  return {
    id, slug: id, noteId: `n-${id}`, userId: 'u', title: id, excerpt: '', content: '',
    coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true,
    allowComments: true, isPinned: false, views: 0, commentsCount: 0,
    publishedAt: 0, createdAt: 0, updatedAt: 0,
    seoTitle: '', seoDescription: '', seoImageUrl: '', seoCanonicalUrl: '', seoNoindex: false,
  }
}

beforeEach(() => {
  postsList.mockReset()
  commentsList.mockReset()
  linksList.mockReset()
  useBlogStore.setState({ loadErrors: new Set(), posts: [], comments: [], links: [] })
})

/**
 * A loader that fails must say so. Before this channel existed the failure was only a console line,
 * and every surface rendered it as an empty result — a reader who was offline was told they had no
 * posts. The flag is per scope: one failed list must not paint the others as broken.
 */
describe('blog load errors', () => {
  it('flags the scope whose load failed and clears it on the next success', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    postsList.mockRejectedValueOnce(new Error('offline'))
    await useBlogStore.getState().loadPosts()
    expect(useBlogStore.getState().loadErrors.has('posts')).toBe(true)

    postsList.mockResolvedValueOnce({ posts: [] })
    await useBlogStore.getState().loadPosts()
    expect(useBlogStore.getState().loadErrors.has('posts')).toBe(false)
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()
  })

  it('keeps the previous rows when a refresh fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    postsList.mockResolvedValueOnce({ posts: [post('kept')] })
    await useBlogStore.getState().loadPosts()

    postsList.mockRejectedValueOnce(new Error('offline'))
    await useBlogStore.getState().loadPosts()

    expect(useBlogStore.getState().posts.map((p) => p.id)).toEqual(['kept'])
    expect(useBlogStore.getState().loadErrors.has('posts')).toBe(true)
    logged.mockRestore()
  })

})

describe('blog load errors stay in their scope', () => {
  it('keeps the scopes apart', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    commentsList.mockRejectedValueOnce(new Error('offline'))
    await useBlogStore.getState().loadComments()

    expect(useBlogStore.getState().loadErrors.has('comments')).toBe(true)
    expect(useBlogStore.getState().loadErrors.has('posts')).toBe(false)
    expect(useBlogStore.getState().loadErrors.has('links')).toBe(false)
    logged.mockRestore()
  })

  it('flags the link list too', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    linksList.mockRejectedValueOnce(new Error('offline'))
    await useBlogStore.getState().loadLinks()
    expect(useBlogStore.getState().loadErrors.has('links')).toBe(true)

    linksList.mockResolvedValueOnce({ links: [], categories: [], counts: { total: 0, pending: 0, approved: 0, rejected: 0, pinned: 0, favorite: 0 } })
    await useBlogStore.getState().loadLinks()
    expect(useBlogStore.getState().loadErrors.has('links')).toBe(false)
    logged.mockRestore()
  })
})
