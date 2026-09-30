import { describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: { blog: { posts: { list: vi.fn() } } },
}))

const list = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>

function post(id: string, title: string) {
  return {
    id, slug: id, noteId: `n-${id}`, userId: 'u', title, excerpt: '', content: '',
    coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true,
    allowComments: true, isPinned: false, views: 0, commentsCount: 0,
    publishedAt: 0, createdAt: 0, updatedAt: 0,
    seoTitle: '', seoDescription: '', seoImageUrl: '', seoCanonicalUrl: '', seoNoindex: false,
  }
}

/**
 * The list is asked once per keystroke in the search box, and answers can arrive out of order. Two
 * rules keep the screen honest: the request a newer one replaces is cancelled, and an answer that
 * arrives after a newer request went out is dropped instead of overwriting it.
 */
describe('blog post list requests', () => {
  it('cancels the request it replaces and keeps the newest answer', async () => {
    let releaseFirst: (value: unknown) => void = () => {}
    const firstAnswer = new Promise((resolve) => { releaseFirst = resolve })
    let firstSignal: AbortSignal | undefined

    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      firstSignal = signal
      return firstAnswer
    })
    list.mockImplementationOnce(async () => ({ posts: [post('new', 'Newest query')] }))

    const older = useBlogStore.getState().loadPosts()
    const newest = useBlogStore.getState().loadPosts()
    await newest

    releaseFirst({ posts: [post('old', 'Older query')] })
    await older

    expect(list).toHaveBeenCalledTimes(2)
    expect(firstSignal?.aborted, 'the replaced request was left running').toBe(true)
    expect(useBlogStore.getState().posts.map((p) => p.id)).toEqual(['new'])
  })

  it('does not report a cancelled request as a failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      await Promise.resolve()
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      return { posts: [] }
    })
    list.mockImplementationOnce(async () => ({ posts: [post('b', 'Second')] }))

    const older = useBlogStore.getState().loadPosts()
    const newest = useBlogStore.getState().loadPosts()
    await Promise.all([older, newest])

    expect(logged, 'a cancelled request is not an error').not.toHaveBeenCalled()
    expect(useBlogStore.getState().posts.map((p) => p.id)).toEqual(['b'])
    logged.mockRestore()
  })
})
