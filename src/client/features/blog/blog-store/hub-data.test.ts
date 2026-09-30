import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../lib/api'
import { useBlogStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      posts: { list: vi.fn() },
      postIndex: vi.fn(),
      folders: { list: vi.fn() },
      tags: { list: vi.fn() },
      categories: { list: vi.fn() },
      comments: { list: vi.fn() },
      stats: vi.fn(),
      links: { list: vi.fn() },
      settings: { get: vi.fn() },
    },
  },
}))

const postsList = api.blog.posts.list as unknown as ReturnType<typeof vi.fn>
const postIndex = api.blog.postIndex as unknown as ReturnType<typeof vi.fn>
const foldersList = api.blog.folders.list as unknown as ReturnType<typeof vi.fn>
const tagsList = api.blog.tags.list as unknown as ReturnType<typeof vi.fn>
const categoriesList = api.blog.categories.list as unknown as ReturnType<typeof vi.fn>
const commentsList = api.blog.comments.list as unknown as ReturnType<typeof vi.fn>
const stats = api.blog.stats as unknown as ReturnType<typeof vi.fn>
const linksList = api.blog.links.list as unknown as ReturnType<typeof vi.fn>
const settingsGet = api.blog.settings.get as unknown as ReturnType<typeof vi.fn>

const ALL = [postsList, postIndex, foldersList, tagsList, categoriesList, commentsList, stats, linksList, settingsGet]

function resolveAll(): void {
  postsList.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
  postIndex.mockResolvedValue({ posts: [] })
  foldersList.mockResolvedValue([])
  tagsList.mockResolvedValue([])
  categoriesList.mockResolvedValue({ categories: [] })
  commentsList.mockResolvedValue({ comments: [] })
  stats.mockResolvedValue({ stats: null })
  linksList.mockResolvedValue({ links: [], categories: [], counts: { total: 0, pending: 0, approved: 0, rejected: 0, pinned: 0, favorite: 0 } })
  settingsGet.mockResolvedValue({ settings: null })
}

function callCounts(): number[] {
  return ALL.map((fn) => fn.mock.calls.length)
}

beforeEach(() => {
  for (const fn of ALL) fn.mockReset()
  resolveAll()
  useBlogStore.setState({ activeTab: 'dashboard', dataLoadedAt: {}, loadErrors: new Set() })
})

/**
 * ENG-05: opening the hub used to fire every endpoint it knew of (eight requests, ~22 D1 statements)
 * and the effect's dependency on the open note re-ran that fan-out whenever a note changed. A tab
 * now asks for what it draws, and a scope that answered within the freshness window is not asked
 * again — except by an explicit refresh, where the reader's click must always mean a new answer.
 */
describe('blog hub data loading', () => {
  it('loads the current tab and none of the others', async () => {
    useBlogStore.setState({ activeTab: 'links' })
    await useBlogStore.getState().loadHubData()

    expect(linksList).toHaveBeenCalledTimes(1)
    expect(foldersList).toHaveBeenCalledTimes(1)
    expect(tagsList).toHaveBeenCalledTimes(1)
    expect(categoriesList).toHaveBeenCalledTimes(1)
    expect(stats).toHaveBeenCalledTimes(1)
    expect(settingsGet).toHaveBeenCalledTimes(1)
    expect(commentsList, 'the links tab does not draw comments').not.toHaveBeenCalled()
    expect(postsList, 'the links tab does not draw the post list').not.toHaveBeenCalled()
    expect(postIndex).not.toHaveBeenCalled()
  })

  it('skips scopes that answered within the freshness window, and a forced refresh does not', async () => {
    useBlogStore.setState({ activeTab: 'comments' })
    await useBlogStore.getState().loadHubData()
    const afterFirst = callCounts()

    for (const fn of ALL) fn.mockClear()
    await useBlogStore.getState().loadHubData()
    expect(callCounts(), 'a second open within the window re-asked a fresh scope').toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])

    await useBlogStore.getState().loadHubData({ force: true })
    expect(callCounts()).toEqual(afterFirst.map((n) => (n > 0 ? 1 : 0)))
  })

  it('loads only what a tab switch is missing', async () => {
    await useBlogStore.getState().loadHubData()
    expect(postsList).not.toHaveBeenCalled()

    useBlogStore.getState().setActiveTab('posts')
    await vi.waitFor(() => expect(postsList).toHaveBeenCalledTimes(1))

    expect(postIndex).toHaveBeenCalledTimes(1)
    expect(foldersList, 'the folders were fresh from the dashboard tab').toHaveBeenCalledTimes(1)
    expect(commentsList).toHaveBeenCalledTimes(1)
  })
})
