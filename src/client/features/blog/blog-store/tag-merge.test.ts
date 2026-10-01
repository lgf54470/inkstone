import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      tags: { list: vi.fn(), merge: vi.fn() },
      posts: { list: vi.fn() },
      postIndex: vi.fn(),
      stats: vi.fn(),
    },
  },
}))

const tagsList = api.blog.tags.list as unknown as ReturnType<typeof vi.fn>
const tagMerge = api.blog.tags.merge as unknown as ReturnType<typeof vi.fn>
const postsList = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>
const postIndex = api.blog.postIndex as unknown as ReturnType<typeof vi.fn>
const statsGet = api.blog.stats as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  tagMerge.mockReset()
  tagsList.mockReset()
  tagsList.mockResolvedValue([])
  postsList.mockReset()
  postIndex.mockReset()
  statsGet.mockReset()
  postsList.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } })
  postIndex.mockResolvedValue({ posts: [] })
  statsGet.mockResolvedValue({ stats: null })
})

/**
 * A merge moves memberships (the posts) and counts (the tag list and the stats) at once, so the store
 * re-asks all three instead of patching one list and leaving the others stale.
 */
describe('blog tag merge action', () => {
  it('merges through the endpoint and re-asks posts, index and stats', async () => {
    tagMerge.mockResolvedValue({ ok: true, moved: 2 })

    const ok = await useBlogStore.getState().mergeTag('tag-a', 'tag-b')

    expect(ok).toBe(true)
    expect(tagMerge).toHaveBeenCalledWith('tag-a', 'tag-b')
    expect(postsList).toHaveBeenCalledTimes(1)
    expect(postIndex).toHaveBeenCalledTimes(1)
    expect(statsGet).toHaveBeenCalledTimes(1)
  })

  it('returns false without re-asking when the endpoint rejects the merge', async () => {
    tagMerge.mockRejectedValue(new Error('nope'))

    const ok = await useBlogStore.getState().mergeTag('tag-a', 'tag-b')

    expect(ok).toBe(false)
    expect(postsList).not.toHaveBeenCalled()
  })
})
