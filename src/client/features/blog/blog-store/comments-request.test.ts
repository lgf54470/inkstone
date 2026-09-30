import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogComment, BlogCommentsCounts } from '@shared/types'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: { blog: { comments: { list: vi.fn() } } },
}))

const list = api.blog.comments.list as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  list.mockReset()
})

function comment(id: string, status: BlogComment['status'] = 'pending'): BlogComment {
  return {
    id, postId: 'p-1', postTitle: 'Hello', postSlug: 'hello', parentId: null,
    authorName: 'Reader', authorEmail: 'reader@example.com', content: 'Nice',
    status, createdAt: 0,
  }
}

function tally(overrides: Partial<BlogCommentsCounts> = {}): BlogCommentsCounts {
  return { all: 0, pending: 0, approved: 0, rejected: 0, spam: 0, ...overrides }
}

function answer(comments: BlogComment[], counts = tally()) {
  return { comments, counts }
}

/**
 * The search box used to narrow the fetched page in the browser, and the tab badges were counted on
 * that same filtered array — so selecting a tab drew every other tab as zero. The query now goes to
 * the server and the tally comes back from it, which is why late answers cannot be painted over the
 * newer question any more.
 */
describe('blog comment list requests', () => {
  it('asks with the search the box holds and stores the tally the server counted', async () => {
    useBlogStore.setState({ commentSearch: '', commentStatusFilter: 'all' })
    list.mockResolvedValue(answer([comment('c-1')], tally({ all: 1, pending: 1 })))

    useBlogStore.getState().setCommentSearch('reader')

    await vi.waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(
        { status: 'all', search: 'reader' },
        expect.any(AbortSignal),
      )
    })
    expect(useBlogStore.getState().commentStats).toEqual(tally({ all: 1, pending: 1 }))
  })
})

describe('blog comment list answer ordering', () => {
  it('cancels the request it replaces and keeps the newest answer', async () => {
    let releaseFirst: (value: unknown) => void = () => {}
    const firstAnswer = new Promise((resolve) => { releaseFirst = resolve })
    let firstSignal: AbortSignal | undefined

    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      firstSignal = signal
      return firstAnswer
    })
    list.mockImplementationOnce(async () => answer([comment('new')]))

    const older = useBlogStore.getState().loadComments()
    const newest = useBlogStore.getState().loadComments()
    await newest

    releaseFirst(answer([comment('old')]))
    await older

    expect(list).toHaveBeenCalledTimes(2)
    expect(firstSignal?.aborted, 'the replaced request was left running').toBe(true)
    expect(useBlogStore.getState().comments.map((c) => c.id)).toEqual(['new'])
  })

  it('does not report a cancelled request as a failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      await Promise.resolve()
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      return answer([])
    })
    list.mockImplementationOnce(async () => answer([comment('b')]))

    const older = useBlogStore.getState().loadComments()
    const newest = useBlogStore.getState().loadComments()
    await Promise.all([older, newest])

    expect(logged, 'a cancelled request is not an error').not.toHaveBeenCalled()
    expect(useBlogStore.getState().comments.map((c) => c.id)).toEqual(['b'])
    logged.mockRestore()
  })
})
