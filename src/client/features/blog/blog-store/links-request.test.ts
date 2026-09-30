import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogLink, BlogLinkStats } from '@shared/types'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: { blog: { links: { list: vi.fn() } } },
}))

const list = api.blog.links.list as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  list.mockReset()
})

function link(id: string): BlogLink {
  return {
    id, name: id, url: `https://${id}.example`, categoryId: null, status: 'approved',
    isPinned: false, pinnedOrder: 0, isFavorite: false, sortOrder: 0, isActive: true,
    clicks: 0, createdAt: 0, updatedAt: 0,
  }
}

function counts(): BlogLinkStats {
  return { total: 0, pending: 0, approved: 0, rejected: 0, pinned: 0, favorite: 0 }
}

function answer(links: BlogLink[]) {
  return { links, categories: [], counts: counts() }
}

/**
 * The link list is filtered by the server now, so its answer has to belong to the filter that is on
 * screen. These cases pin the question the client asks and the two rules that keep a late answer
 * from overwriting it: the request a newer one replaces is cancelled, and an answer that arrives
 * after a newer request went out is dropped.
 */
describe('blog link list requests', () => {
  it('asks the server with every filter the view is showing', async () => {
    list.mockImplementation(async () => answer([]))

    useBlogStore.getState().setLinkStatusFilter('pinned')
    useBlogStore.getState().setLinkCategoryId('cat-1')
    useBlogStore.getState().setLinkSearch('react')

    await vi.waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(
        { status: 'pinned', categoryId: 'cat-1', search: 'react' },
        expect.any(AbortSignal),
      )
    })
  })
})

describe('blog link list answer ordering', () => {
  it('cancels the request it replaces and keeps the newest answer', async () => {
    let releaseFirst: (value: unknown) => void = () => {}
    const firstAnswer = new Promise((resolve) => { releaseFirst = resolve })
    let firstSignal: AbortSignal | undefined

    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      firstSignal = signal
      return firstAnswer
    })
    list.mockImplementationOnce(async () => answer([link('new')]))

    const older = useBlogStore.getState().loadLinks()
    const newest = useBlogStore.getState().loadLinks()
    await newest

    releaseFirst(answer([link('old')]))
    await older

    expect(list).toHaveBeenCalledTimes(2)
    expect(firstSignal?.aborted, 'the replaced request was left running').toBe(true)
    expect(useBlogStore.getState().links.map((l) => l.id)).toEqual(['new'])
  })

  it('does not report a cancelled request as a failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementationOnce(async (_params: unknown, signal: AbortSignal) => {
      await Promise.resolve()
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      return answer([])
    })
    list.mockImplementationOnce(async () => answer([link('b')]))

    const older = useBlogStore.getState().loadLinks()
    const newest = useBlogStore.getState().loadLinks()
    await Promise.all([older, newest])

    expect(logged, 'a cancelled request is not an error').not.toHaveBeenCalled()
    expect(useBlogStore.getState().links.map((l) => l.id)).toEqual(['b'])
    logged.mockRestore()
  })
})
