import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      posts: { list: vi.fn(), patch: vi.fn(), batch: vi.fn() },
      postIndex: vi.fn(),
      tags: { list: vi.fn() },
      categories: { list: vi.fn() },
      stats: vi.fn(),
      links: { list: vi.fn(), batch: vi.fn() },
    },
  },
}))

const postsList = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>
const postsPatch = api.blog.posts.patch as unknown as ReturnType<typeof vi.fn>
const postsBatch = api.blog.posts.batch as unknown as ReturnType<typeof vi.fn>
const postIndex = api.blog.postIndex as unknown as ReturnType<typeof vi.fn>
const tagsList = api.blog.tags.list as unknown as ReturnType<typeof vi.fn>
const categoriesList = api.blog.categories.list as unknown as ReturnType<typeof vi.fn>
const statsGet = api.blog.stats as unknown as ReturnType<typeof vi.fn>
const linksList = api.blog.links.list as unknown as ReturnType<typeof vi.fn>
const linksBatch = api.blog.links.batch as unknown as ReturnType<typeof vi.fn>

const POST = {
  id: 'p1', slug: 'p1', noteId: 'n-p1', userId: 'u', title: 'p1', excerpt: '',
  coverUrl: '', categoryId: null, folderId: null, tags: [], isPublished: true,
  allowComments: true, isPinned: false, views: 0, commentsCount: 0,
  publishedAt: 0, createdAt: 0, updatedAt: 0,
}

function resetMocks() {
  for (const mock of [postsList, postsPatch, postsBatch, postIndex, tagsList, categoriesList, statsGet, linksList, linksBatch]) {
    mock.mockReset()
  }
  postsList.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } })
  postsPatch.mockResolvedValue({})
  postsBatch.mockResolvedValue({ ok: true, count: 1 })
  postIndex.mockResolvedValue({ posts: [] })
  tagsList.mockResolvedValue([])
  categoriesList.mockResolvedValue({ categories: [] })
  statsGet.mockResolvedValue({ stats: null })
  linksList.mockResolvedValue({
    links: [],
    categories: [],
    counts: { total: 0, pending: 0, approved: 0, rejected: 0, pinned: 0, favorite: 0 },
  })
  linksBatch.mockResolvedValue({ ok: true, count: 3 })
}

beforeEach(() => {
  resetMocks()
  useBlogStore.setState({ posts: [{ ...POST }], postIndex: [], selectedPostIds: new Set() })
})

/**
 * A mutation used to re-ask for everything the hub caches: toggling one pin cost the post list, the
 * note index, the dashboard's counts and the whole tag list. What a change invalidates depends on
 * what it changed, so the patch itself decides which aggregates are asked for again.
 */
describe('a post patch re-asks only for what it moved', () => {
  it('re-asks the pinned count for a pin, but not the tag list', async () => {
    await useBlogStore.getState().updatePost('p1', { isPinned: true })

    expect(postsList).toHaveBeenCalledTimes(1)
    expect(postIndex).toHaveBeenCalledTimes(1)
    // The sidebar draws its "Pinned" count from the summary stats, so a pin does move one; the tag
    // list is the expensive question this used to ask on every patch and never needed answered.
    expect(statsGet).toHaveBeenCalledTimes(1)
    expect(tagsList).not.toHaveBeenCalled()
    expect(categoriesList).not.toHaveBeenCalled()
  })

  it('asks for nothing but the list and the index when only the title changes', async () => {
    await useBlogStore.getState().updatePost('p1', { title: 'renamed' })

    expect(postsList).toHaveBeenCalledTimes(1)
    expect(postIndex).toHaveBeenCalledTimes(1)
    expect(statsGet).not.toHaveBeenCalled()
    expect(tagsList).not.toHaveBeenCalled()
    expect(categoriesList).not.toHaveBeenCalled()
  })

  it('re-asks the summary counts for a publish, but not the tag list', async () => {
    await useBlogStore.getState().updatePost('p1', { isPublished: false })

    expect(statsGet).toHaveBeenCalledTimes(1)
    expect(tagsList).not.toHaveBeenCalled()
    expect(categoriesList).not.toHaveBeenCalled()
  })

  it('re-asks the tag counts when the patch rewrites the tags', async () => {
    await useBlogStore.getState().updatePost('p1', { tags: ['alpha'] })

    expect(statsGet).toHaveBeenCalledTimes(1)
    expect(tagsList).toHaveBeenCalledTimes(1)
  })

  it('re-asks the category counts when the patch moves the category, and no summary count', async () => {
    await useBlogStore.getState().updatePost('p1', { categoryId: 'c2' })

    expect(categoriesList).toHaveBeenCalledTimes(1)
    expect(statsGet).not.toHaveBeenCalled()
    expect(tagsList).not.toHaveBeenCalled()
  })
})

describe('a batch action re-asks only for what it moved', () => {
  it('keeps the tag list out of a pin', async () => {
    useBlogStore.setState({ selectedPostIds: new Set(['p1']) })
    await useBlogStore.getState().batchPosts('setPinned', null, true)

    expect(statsGet).toHaveBeenCalledTimes(1)
    expect(tagsList).not.toHaveBeenCalled()
    expect(categoriesList).not.toHaveBeenCalled()
  })

  it('asks for the categories instead of the summary counts when moving category', async () => {
    useBlogStore.setState({ selectedPostIds: new Set(['p1']) })
    await useBlogStore.getState().batchPosts('setCategory', 'c2')

    expect(categoriesList).toHaveBeenCalledTimes(1)
    expect(statsGet).not.toHaveBeenCalled()
    expect(tagsList).not.toHaveBeenCalled()
  })

  it('asks for the tag list when deleting, because the last post of a tag changes its count', async () => {
    useBlogStore.setState({ selectedPostIds: new Set(['p1']) })
    await useBlogStore.getState().batchPosts('delete')

    expect(statsGet).toHaveBeenCalledTimes(1)
    expect(tagsList).toHaveBeenCalledTimes(1)
  })
})

/**
 * The checker's bulk delete used to call `deleteLink` per row: twenty broken links were twenty
 * DELETEs and twenty full list reloads. The batch endpoint answers the whole set with one call, and
 * the list is reloaded once.
 */
describe('bulk deleting links', () => {
  it('sends one batch request and reloads the list once', async () => {
    const deleted = await useBlogStore.getState().batchDeleteLinks(['l1', 'l2', 'l3'])

    expect(deleted).toBe(true)
    expect(linksBatch).toHaveBeenCalledTimes(1)
    expect(linksBatch).toHaveBeenCalledWith('delete', ['l1', 'l2', 'l3'])
    expect(linksList).toHaveBeenCalledTimes(1)
  })

  it('reports the failure and leaves the list alone when the batch request fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    linksBatch.mockRejectedValueOnce(new Error('offline'))

    const deleted = await useBlogStore.getState().batchDeleteLinks(['l1'])

    expect(deleted).toBe(false)
    expect(linksList).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})
